import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadPdf, fetchPdfBlobUrl } from "../downloadResume";
import AlternateDatesField, {
  parseAlternateSlots,
} from "../components/AlternateDatesField";
import DashboardTabs from "../components/DashboardTabs";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import MonthCalendar from "../components/MonthCalendar";
import StatusPill from "../components/StatusPill";
import { APP_STATUSES, DRIVE_ROUNDS, roundLabel } from "../constants/rounds";
import { cgpaKeyDown, parseCgpa, sanitizeCgpaInput } from "../utils/cgpa";
import {
  confirmSundayWithCollege,
  isPastDate,
  isSunday,
  pastDateError,
  todayISO,
} from "../utils/dates";
import { buildDriveMarks, driveColor } from "../utils/driveColor";
import { formatDriveWhen, formatNiceTime } from "../utils/driveWhen";
import { driveStatusLabel } from "../utils/statusLabels";

function driveToEditForm(drive) {
  return {
    title: drive.title || "",
    role: drive.role || "",
    package_lpa: drive.package_lpa ?? "",
    location: drive.location || "",
    drive_date: drive.drive_date || "",
    drive_time: drive.drive_time || "",
    deadline: drive.deadline || "",
    alternate_dates: drive.alternate_dates || "",
    min_cgpa: drive.min_cgpa != null ? String(drive.min_cgpa) : "",
    eligible_branches: drive.eligible_branches || "",
    description: drive.description || "",
  };
}

const emptyDrive = {
  title: "",
  role: "",
  package_lpa: "",
  location: "",
  drive_date: "",
  drive_time: "",
  deadline: "",
  alternate_dates: "",
  min_cgpa: "6.5",
  eligible_branches: "CSE,IT,ECE",
  description: "",
};

export default function CompanyDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("drives");
  const [drives, setDrives] = useState([]);
  const [form, setForm] = useState(emptyDrive);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [message, setMessage] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [offerFiles, setOfferFiles] = useState({});
  const [campusDrives, setCampusDrives] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [calendarDay, setCalendarDay] = useState(null);
  const [roundForms, setRoundForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [driveQuery, setDriveQuery] = useState("");
  const [applicantQuery, setApplicantQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedDriveId, setExpandedDriveId] = useState(null);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);
  const [applicantStatusFilter, setApplicantStatusFilter] = useState("all");
  const [applicantRoundFilter, setApplicantRoundFilter] = useState("all");
  const [applicantSort, setApplicantSort] = useState({ key: "name", dir: "asc" });
  const [resumePreview, setResumePreview] = useState(null);
  const [applicantsUpdatedAt, setApplicantsUpdatedAt] = useState(null);

  const loadDrives = async () => {
    const { data } = await api.get("/drives");
    setDrives(data);
    const forms = {};
    data.forEach((drive) => {
      const info = drive.current_round_info || {};
      forms[drive.id] = {
        current_round: drive.current_round || "registration",
        date: info.date || "",
        time: info.time || "",
        venue: info.venue || "",
        meet_link: info.meet_link || "",
        notes: info.notes || "",
      };
    });
    setRoundForms(forms);
  };

  const loadCalendar = async () => {
    const { data } = await api.get("/drives/campus-calendar");
    setCampusDrives(data.drives || []);
    setBlockedDates(data.blocked_dates || []);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDrives(), loadCalendar()])
      .catch(() => setMessage("Could not load company data"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key) => (e) => {
    if (key === "min_cgpa") {
      setForm({ ...form, min_cgpa: sanitizeCgpaInput(e.target.value) });
      return;
    }
    setForm({ ...form, [key]: e.target.value });
  };

  const minDate = todayISO();

  const createDrive = async (e) => {
    e.preventDefault();
    setMessage("");
    const parsedMin = parseCgpa(form.min_cgpa === "" ? 0 : form.min_cgpa);
    if (!parsedMin.ok) {
      setMessage(parsedMin.error.replace("CGPA", "Min CGPA"));
      return;
    }
    if (isPastDate(form.drive_date)) {
      setMessage(pastDateError("Preferred date"));
      return;
    }
    if (isPastDate(form.deadline)) {
      setMessage(pastDateError("Deadline"));
      return;
    }
    if (form.alternate_dates) {
      const badAlt = parseAlternateSlots(form.alternate_dates).find(
        (s) => s.date && isPastDate(s.date)
      );
      if (badAlt) {
        setMessage(pastDateError("Alternate date"));
        return;
      }
    }
    if (!confirmSundayWithCollege(form.drive_date)) return;
    const sundaySlot = isSunday(form.drive_date);
    try {
      await api.post("/drives", {
        ...form,
        package_lpa: form.package_lpa ? Number(form.package_lpa) : null,
        min_cgpa: parsedMin.value ?? 0,
      });
      setForm(emptyDrive);
      setMessage(
        sundaySlot
          ? "Sunday drive proposed — placement will confirm with college."
          : "Drive proposed. Waiting for placement date/time approval."
      );
      await Promise.all([loadDrives(), loadCalendar()]);
      setTab("drives");
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not create drive");
    }
  };

  const proposeNewDate = async (driveId) => {
    if (!rescheduleDate) {
      setMessage("Pick a new date first");
      return;
    }
    if (isPastDate(rescheduleDate)) {
      setMessage(pastDateError("Drive date"));
      return;
    }
    if (!confirmSundayWithCollege(rescheduleDate)) return;
    try {
      await api.patch(`/drives/${driveId}`, {
        drive_date: rescheduleDate,
        drive_time: rescheduleTime || null,
      });
      setMessage(
        isSunday(rescheduleDate)
          ? "Sunday slot proposed — placement will check with college."
          : "New date/time proposed to placement team"
      );
      setRescheduleDate("");
      setRescheduleTime("");
      await Promise.all([loadDrives(), loadCalendar()]);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update date");
    }
  };

  const startEditDrive = (drive) => {
    setEditingId(drive.id);
    setEditForm(driveToEditForm(drive));
  };

  const cancelEditDrive = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const updateEdit = (key) => (e) => {
    if (key === "min_cgpa") {
      setEditForm({ ...editForm, min_cgpa: sanitizeCgpaInput(e.target.value) });
      return;
    }
    setEditForm({ ...editForm, [key]: e.target.value });
  };

  const saveDriveEdit = async (driveId) => {
    if (!editForm) return;
    if (isPastDate(editForm.drive_date)) {
      setMessage(pastDateError("Preferred date"));
      return;
    }
    if (isPastDate(editForm.deadline)) {
      setMessage(pastDateError("Deadline"));
      return;
    }
    if (editForm.alternate_dates) {
      const badAlt = parseAlternateSlots(editForm.alternate_dates).find(
        (s) => s.date && isPastDate(s.date)
      );
      if (badAlt) {
        setMessage(pastDateError("Alternate date"));
        return;
      }
    }
    const parsedMin = parseCgpa(editForm.min_cgpa === "" ? 0 : editForm.min_cgpa);
    if (!parsedMin.ok) {
      setMessage(parsedMin.error.replace("CGPA", "Min CGPA"));
      return;
    }
    if (!confirmSundayWithCollege(editForm.drive_date)) return;
    setSavingEdit(true);
    setMessage("");
    try {
      await api.patch(`/drives/${driveId}`, {
        title: editForm.title,
        role: editForm.role,
        package_lpa: editForm.package_lpa === "" ? null : Number(editForm.package_lpa),
        location: editForm.location,
        drive_date: editForm.drive_date || null,
        drive_time: editForm.drive_time || null,
        deadline: editForm.deadline || null,
        alternate_dates: editForm.alternate_dates || null,
        min_cgpa: parsedMin.value ?? 0,
        eligible_branches: editForm.eligible_branches,
        description: editForm.description,
      });
      setMessage(
        isSunday(editForm.drive_date)
          ? "Updated — Sunday slot flagged for college confirmation."
          : "Drive updated — still awaiting placement approval"
      );
      cancelEditDrive();
      await Promise.all([loadDrives(), loadCalendar()]);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update drive");
    } finally {
      setSavingEdit(false);
    }
  };

  const loadApplicants = async (driveId, { silent = false } = {}) => {
    if (!driveId) {
      setApplicants([]);
      setApplicantsUpdatedAt(null);
      return;
    }
    try {
      const { data } = await api.get(`/applications/drive/${driveId}`);
      setApplicants(Array.isArray(data) ? data : []);
      setApplicantsUpdatedAt(Date.now());
    } catch (err) {
      if (!silent) {
        setApplicants([]);
        setMessage(err.response?.data?.error || "Could not load applicants");
      }
    }
  };

  // Live refresh while Applicants tab is open; also on window focus / tab visible
  useEffect(() => {
    if (tab !== "applicants" || !selectedDrive) return undefined;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      loadApplicants(selectedDrive, { silent: true });
      loadDrives().catch(() => {});
    };
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab, selectedDrive]);

  const viewApplicants = async (driveId) => {
    setSelectedDrive(driveId);
    setApplicantQuery("");
    setSelectedApplicantIds([]);
    setApplicantStatusFilter("all");
    setApplicantRoundFilter("all");
    setTab("applicants");
    await loadApplicants(driveId);
    await loadDrives().catch(() => {});
  };

  const openResumePreview = async (app) => {
    if (!app?.student?.id) return;
    try {
      if (resumePreview?.url) window.URL.revokeObjectURL(resumePreview.url);
      const url = await fetchPdfBlobUrl(`/students/${app.student.id}/resume?inline=1`);
      setResumePreview({
        url,
        name: app.student.full_name || "Student",
        studentId: app.student.id,
        fileName:
          app.student.resume_original_name ||
          `${app.student.full_name || "student"}_resume.pdf`,
      });
    } catch {
      setMessage("Could not open resume preview");
    }
  };

  const closeResumePreview = () => {
    if (resumePreview?.url) window.URL.revokeObjectURL(resumePreview.url);
    setResumePreview(null);
  };

  const exportApplicantsCsv = () => {
    const rows = visibleApplicants.map((app) => [
      app.student?.full_name || "",
      app.student?.branch || "",
      app.student?.cgpa ?? "",
      app.status_label || app.status || "",
      app.attended_current_round ? "Yes" : "No",
      app.last_round_cleared_label || "",
      app.has_offer_letter ? "Uploaded" : app.status === "selected" ? "Pending" : "",
    ]);
    const header = ["Name", "Branch", "CGPA", "Status", "Attended", "Cleared", "Offer"];
    const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applicants-drive-${selectedDrive || "all"}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleApplicantSelect = (id) => {
    setSelectedApplicantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const ids = visibleApplicants.map((a) => a.id);
    const allOn = ids.length && ids.every((id) => selectedApplicantIds.includes(id));
    setSelectedApplicantIds(allOn ? [] : ids);
  };

  const bulkUpdate = async (payload) => {
    if (!selectedApplicantIds.length) return;
    try {
      await Promise.all(
        selectedApplicantIds.map((id) =>
          api.patch(
            `/applications/${id}/status`,
            typeof payload === "string" ? { status: payload } : payload
          )
        )
      );
      setMessage(`Updated ${selectedApplicantIds.length} applicant(s)`);
      setSelectedApplicantIds([]);
      await loadApplicants(selectedDrive);
      await loadDrives().catch(() => {});
    } catch (err) {
      setMessage(err.response?.data?.error || "Bulk update failed");
    }
  };

  const conflictSummary = (drive) => {
    const list = drive.conflicts || [];
    if (!list.length) return { text: "—", title: "", tone: "" };
    const high = list.some((c) => c.severity === "high");
    return {
      text: `${list.length} issue${list.length === 1 ? "" : "s"}`,
      title: list.map((c) => c.message).join("\n"),
      tone: high ? "error" : "warn-note",
    };
  };

  const setStatus = async (applicationId, payload) => {
    try {
      await api.patch(
        `/applications/${applicationId}/status`,
        typeof payload === "string" ? { status: payload } : payload
      );
      await loadApplicants(selectedDrive);
      await loadDrives().catch(() => {});
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update applicant");
    }
  };

  const updateRoundForm = (driveId, key, value) => {
    setRoundForms((prev) => ({
      ...prev,
      [driveId]: { ...prev[driveId], [key]: value },
    }));
  };

  const changeRound = (drive, nextRound) => {
    setRoundForms((prev) => {
      const current = prev[drive.id] || {
        current_round: drive.current_round || "registration",
        date: "",
        time: "",
        venue: "",
        meet_link: "",
        notes: "",
      };
      const info = drive.round_details?.[nextRound] || {};
      return {
        ...prev,
        [drive.id]: {
          ...current,
          current_round: nextRound,
          // Prefer saved round details, else fall back to drive slot
          date: info.date || current.date || drive.drive_date || "",
          time: info.time || current.time || drive.drive_time || "",
          venue: info.venue || current.venue || "",
          meet_link: info.meet_link || current.meet_link || "",
          notes: info.notes || current.notes || "",
        },
      };
    });
  };

  const saveRound = async (driveId) => {
    const form = roundForms[driveId];
    if (!form) return;
    if (isPastDate(form.date)) {
      setMessage(pastDateError("Round date"));
      return;
    }
    try {
      await api.patch(`/drives/${driveId}`, {
        current_round: form.current_round,
        round_detail: {
          round: form.current_round,
          date: form.date,
          time: form.time,
          venue: form.venue,
          meet_link: form.meet_link,
          notes: form.notes,
        },
      });
      setMessage(`Round updated to ${roundLabel(form.current_round)} (students notified)`);
      await Promise.all([loadDrives(), loadCalendar()]);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update round");
    }
  };

  const advanceIntoRound = async (driveId) => {
    try {
      const { data } = await api.post(`/drives/${driveId}/advance-round`);
      setMessage(data.message);
      if (selectedDrive === driveId) await viewApplicants(driveId);
      await loadDrives();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not advance applicants");
    }
  };

  const uploadOffer = async (applicationId) => {
    const file = offerFiles[applicationId];
    if (!file) {
      setMessage("Choose an offer PDF first");
      return;
    }
    const formData = new FormData();
    formData.append("offer", file);
    try {
      await api.post(`/applications/${applicationId}/offer`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage("Offer letter uploaded");
      await viewApplicants(selectedDrive);
    } catch (err) {
      setMessage(err.response?.data?.error || "Offer upload failed");
    }
  };

  const totalApplicants = drives.reduce(
    (sum, d) => sum + (Number(d.applications_count) || 0),
    0
  );
  const driveQ = driveQuery.trim().toLowerCase();
  const visibleDrives = drives.filter((drive) => {
    if (!driveQ) return true;
    return [drive.title, drive.role, drive.status, drive.current_round_label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(driveQ));
  });
  const applicantQ = applicantQuery.trim().toLowerCase();
  const selectedDriveMeta = drives.find((d) => d.id === selectedDrive);
  const visibleApplicants = useMemo(() => {
    const currentRound = selectedDriveMeta?.current_round;
    let list = applicants.filter((app) => {
      if (applicantStatusFilter !== "all" && app.status !== applicantStatusFilter) {
        return false;
      }
      if (applicantRoundFilter === "cleared") {
        if (!app.last_round_cleared) return false;
      } else if (applicantRoundFilter === "pending") {
        if (
          currentRound &&
          currentRound !== "registration" &&
          app.last_round_cleared === currentRound
        ) {
          return false;
        }
        if (!currentRound || currentRound === "registration") {
          if (app.last_round_cleared) return false;
        }
      }
      if (!applicantQ) return true;
      return [app.student?.full_name, app.student?.branch, app.status, app.status_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(applicantQ));
    });
    const { key, dir } = applicantSort;
    const mul = dir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (key === "cgpa") {
        const av = Number(a.student?.cgpa) || 0;
        const bv = Number(b.student?.cgpa) || 0;
        return (av - bv) * mul;
      }
      let av = "";
      let bv = "";
      if (key === "name") {
        av = a.student?.full_name || "";
        bv = b.student?.full_name || "";
      } else if (key === "branch") {
        av = a.student?.branch || "";
        bv = b.student?.branch || "";
      } else if (key === "status") {
        av = a.status_label || a.status || "";
        bv = b.status_label || b.status || "";
      } else if (key === "offer") {
        av = a.has_offer_letter ? "2" : a.status === "selected" ? "1" : "0";
        bv = b.has_offer_letter ? "2" : b.status === "selected" ? "1" : "0";
      }
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * mul;
    });
    return list;
  }, [
    applicants,
    applicantQ,
    applicantStatusFilter,
    applicantRoundFilter,
    applicantSort,
    selectedDriveMeta,
  ]);

  const toggleApplicantSort = (key) => {
    setApplicantSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const sortMark = (key) =>
    applicantSort.key === key ? (applicantSort.dir === "asc" ? " ↑" : " ↓") : "";

  const markedDriveDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (!drive.drive_date) return;
      map[drive.drive_date] = (map[drive.drive_date] || 0) + 1;
    });
    return map;
  }, [campusDrives]);

  const calendarDriveMarks = useMemo(
    () => buildDriveMarks(campusDrives, { skipCancelled: true }),
    [campusDrives]
  );

  const mineDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (drive.is_mine && drive.drive_date) map[drive.drive_date] = true;
    });
    return map;
  }, [campusDrives]);

  const otherDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (!drive.is_mine && drive.drive_date) map[drive.drive_date] = true;
    });
    return map;
  }, [campusDrives]);

  const blockedDateMap = useMemo(() => {
    const map = {};
    const pad = (n) => String(n).padStart(2, "0");
    blockedDates.forEach((block) => {
      if (!block.start_date || !block.end_date) return;
      const start = new Date(`${block.start_date}T00:00:00`);
      const end = new Date(`${block.end_date}T00:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        map[iso] = true;
      }
    });
    return map;
  }, [blockedDates]);

  const drivesOnDay = useMemo(() => {
    if (!calendarDay) return [];
    return campusDrives.filter((d) => d.drive_date === calendarDay);
  }, [campusDrives, calendarDay]);

  const blocksOnDay = useMemo(() => {
    if (!calendarDay) return [];
    return blockedDates.filter(
      (b) => b.start_date <= calendarDay && b.end_date >= calendarDay
    );
  }, [blockedDates, calendarDay]);

  const tabs = [
    { id: "drives", label: "My drives", count: drives.length },
    { id: "calendar", label: "Calendar" },
    { id: "post", label: "Propose drive" },
    {
      id: "applicants",
      label: "Applicants",
      count: selectedDrive ? applicants.length : totalApplicants,
    },
  ];

  return (
    <div className="dashboard dash-shell">
      <header className="dash-header">
        <div>
          <h2>Hiring desk</h2>
          <p className="muted">
            {user?.is_approved === false
              ? "Awaiting placement team approval."
              : `${drives.length} drive${drives.length === 1 ? "" : "s"} · ${user?.email || ""}`}
          </p>
        </div>
      </header>

      {message && <div className="toast-banner is-ok">{message}</div>}

      <DashboardTabs tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <section className="tab-panel">
          <LoadingSkeleton rows={4} />
        </section>
      ) : (
      <section className="tab-panel" key={tab}>
        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>Your drives</h3>
              <p className="muted">Tap a drive to open applicants. Manage opens rounds and edits.</p>
            </div>
            <label className="full search-field">
              Search drives
              <input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="Title, role, or status"
              />
            </label>
            <div className="table-wrap sheet-wrap sheet-desktop">
              <table className="report-table sheet-table sheet-compact drives-sheet">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Role</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Round</th>
                    <th>Applicants</th>
                    <th>Conflicts</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDrives.map((drive) => {
                    const cs = conflictSummary(drive);
                    const expanded = expandedDriveId === drive.id;
                    return (
                      <tr
                        key={drive.id}
                        className={expanded ? "is-row-active" : ""}
                        onClick={() => viewApplicants(drive.id)}
                        style={{ cursor: "pointer" }}
                        title="Open applicants"
                      >
                        <td>
                          <strong>{drive.title}</strong>
                          {isSunday(drive.drive_date) ? (
                            <span className="warn-note field-hint"> Sunday</span>
                          ) : null}
                        </td>
                        <td>{drive.role || "—"}</td>
                        <td>{formatDriveWhen(drive)}</td>
                        <td>
                          <StatusPill status={drive.status} />
                        </td>
                        <td>{drive.current_round_label || roundLabel(drive.current_round)}</td>
                        <td>{drive.applications_count ?? 0}</td>
                        <td>
                          <span className={cs.tone || "muted"} title={cs.title}>
                            {cs.text}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn ghost btn-xs"
                            type="button"
                            onClick={() => setExpandedDriveId(expanded ? null : drive.id)}
                          >
                            {expanded ? "Close" : "Manage"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleDrives.length && (
                    <tr>
                      <td colSpan={8} className="muted">
                        {drives.length ? "No matching drives." : "No drives yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sheet-mobile-cards">
              {visibleDrives.map((drive) => {
                const cs = conflictSummary(drive);
                const expanded = expandedDriveId === drive.id;
                return (
                  <article key={`m-${drive.id}`} className="soft-card sheet-mobile-card">
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{drive.title}</strong>
                        <p className="muted">
                          {drive.role || "Role TBA"} · {formatDriveWhen(drive)}
                        </p>
                        <p className="muted">
                          {drive.current_round_label || roundLabel(drive.current_round)} ·{" "}
                          {drive.applications_count ?? 0} applicant
                          {(drive.applications_count ?? 0) === 1 ? "" : "s"}
                          {cs.text !== "—" ? ` · ${cs.text}` : ""}
                        </p>
                        {isSunday(drive.drive_date) ? (
                          <p className="warn-note">Sunday slot</p>
                        ) : null}
                      </div>
                      <StatusPill status={drive.status} />
                    </div>
                    <div className="sheet-actions-row" style={{ marginTop: "0.55rem" }}>
                      <button
                        className="btn primary"
                        type="button"
                        onClick={() => viewApplicants(drive.id)}
                      >
                        Open
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => setExpandedDriveId(expanded ? null : drive.id)}
                      >
                        {expanded ? "Close" : "Manage"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {!visibleDrives.length && !drives.length && (
              <EmptyState
                title="No drives yet"
                message="Propose a drive with a preferred date and time to get started."
                actionLabel="Propose drive"
                onAction={() => setTab("post")}
              />
            )}

            {expandedDriveId &&
              (() => {
                const drive = drives.find((d) => d.id === expandedDriveId);
                if (!drive) return null;
                const rf = roundForms[drive.id] || {
                  current_round: drive.current_round || "registration",
                  date: "",
                  time: "",
                  venue: "",
                  meet_link: "",
                  notes: "",
                };
                return (
                  <article className="soft-card drive-detail-panel" key={`detail-${drive.id}`}>
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{drive.title}</strong>
                        <p className="muted">
                          {drive.role} · Preferred: {formatDriveWhen(drive)}
                        </p>
                        {isSunday(drive.drive_date) && (
                          <p className="warn-note">
                            Sunday slot — placement will confirm with college before approving.
                          </p>
                        )}
                        {drive.placement_note && (
                          <p className="warn-note">Placement note: {drive.placement_note}</p>
                        )}
                        {(drive.conflicts || []).length > 0 && (
                          <ul className="conflict-list">
                            {(drive.conflicts || []).map((c, i) => (
                              <li key={i} className={c.severity === "high" ? "error" : "warn-note"}>
                                {c.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <StatusPill status={drive.status} />
                    </div>

                    {(drive.status === "proposed" || drive.status === "needs_reschedule") &&
                      editingId === drive.id &&
                      editForm && (
                        <form
                          className="grid-form compact-form surface-form"
                          style={{ marginTop: "0.75rem" }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveDriveEdit(drive.id);
                          }}
                        >
                          <label>
                            Title
                            <input
                              value={editForm.title}
                              onChange={updateEdit("title")}
                              required
                            />
                          </label>
                          <label>
                            Role
                            <input value={editForm.role} onChange={updateEdit("role")} />
                          </label>
                          <label>
                            Preferred date
                            <input
                              type="date"
                              min={minDate}
                              value={editForm.drive_date}
                              onChange={updateEdit("drive_date")}
                            />
                          </label>
                          <label>
                            Preferred time
                            <input
                              type="time"
                              value={editForm.drive_time}
                              onChange={updateEdit("drive_time")}
                            />
                            {editForm.drive_time ? (
                              <span className="muted field-hint">
                                {formatNiceTime(editForm.drive_time)}
                              </span>
                            ) : null}
                          </label>
                          <label>
                            Package (LPA)
                            <input
                              type="number"
                              step="0.1"
                              value={editForm.package_lpa}
                              onChange={updateEdit("package_lpa")}
                            />
                          </label>
                          <label>
                            Location
                            <input value={editForm.location} onChange={updateEdit("location")} />
                          </label>
                          <label>
                            Deadline
                            <input
                              type="date"
                              min={minDate}
                              value={editForm.deadline}
                              onChange={updateEdit("deadline")}
                            />
                          </label>
                          <label>
                            Min CGPA
                            <input
                              value={editForm.min_cgpa}
                              onChange={updateEdit("min_cgpa")}
                              onKeyDown={cgpaKeyDown}
                              type="text"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="full">
                            Eligible branches
                            <input
                              value={editForm.eligible_branches}
                              onChange={updateEdit("eligible_branches")}
                            />
                          </label>
                          <label className="full">
                            Alternate dates & times
                            <AlternateDatesField
                              value={editForm.alternate_dates}
                              min={minDate}
                              onChange={(next) =>
                                setEditForm({ ...editForm, alternate_dates: next })
                              }
                            />
                          </label>
                          <label className="full">
                            Description
                            <textarea
                              value={editForm.description}
                              onChange={updateEdit("description")}
                              rows={2}
                            />
                          </label>
                          <div className="cta-row full">
                            <button className="btn primary" type="submit" disabled={savingEdit}>
                              {savingEdit ? "Saving…" : "Save changes"}
                            </button>
                            <button className="btn ghost" type="button" onClick={cancelEditDrive}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}

                    {drive.status === "needs_reschedule" && editingId !== drive.id && (
                      <div className="cta-row" style={{ marginTop: "0.6rem" }}>
                        <input
                          type="date"
                          min={minDate}
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                        />
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                        />
                        {rescheduleTime ? (
                          <span className="muted">{formatNiceTime(rescheduleTime)}</span>
                        ) : null}
                        <button className="btn primary" onClick={() => proposeNewDate(drive.id)}>
                          Propose new slot
                        </button>
                      </div>
                    )}

                    {drive.status === "scheduled" && (
                      <div className="round-box">
                        <div className="grid-form compact-form">
                          <label>
                            Round
                            <select
                              value={rf.current_round}
                              onChange={(e) => changeRound(drive, e.target.value)}
                            >
                              {DRIVE_ROUNDS.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Round date
                            <input
                              type="date"
                              min={minDate}
                              value={rf.date}
                              onChange={(e) => updateRoundForm(drive.id, "date", e.target.value)}
                            />
                          </label>
                          <label>
                            Round time
                            <input
                              type="time"
                              value={rf.time}
                              onChange={(e) => updateRoundForm(drive.id, "time", e.target.value)}
                            />
                            {rf.time ? (
                              <span className="muted field-hint">{formatNiceTime(rf.time)}</span>
                            ) : null}
                          </label>
                          <label>
                            Venue
                            <input
                              value={rf.venue}
                              onChange={(e) => updateRoundForm(drive.id, "venue", e.target.value)}
                              placeholder="Hall A / Online"
                            />
                          </label>
                          <label className="full">
                            Meet link
                            <input
                              value={rf.meet_link}
                              onChange={(e) =>
                                updateRoundForm(drive.id, "meet_link", e.target.value)
                              }
                              placeholder="https://..."
                            />
                          </label>
                        </div>
                        <div className="cta-row" style={{ marginTop: "0.55rem" }}>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => saveRound(drive.id)}
                          >
                            Save round
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => advanceIntoRound(drive.id)}
                          >
                            Move shortlisted → in round
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="cta-row" style={{ marginTop: "0.6rem" }}>
                      {(drive.status === "proposed" || drive.status === "needs_reschedule") &&
                        editingId !== drive.id && (
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => startEditDrive(drive)}
                          >
                            Edit proposal
                          </button>
                        )}
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => setExpandedDriveId(null)}
                      >
                        Close
                      </button>
                    </div>
                  </article>
                );
              })()}
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="panel-head">
              <h3>Campus calendar</h3>
              <p className="muted">
                Plan around your drives, other companies, and exam/blocked days
              </p>
            </div>
            <div className="calendar-layout">
              <MonthCalendar
                markedDates={markedDriveDates}
                mineDates={mineDates}
                otherDates={otherDates}
                driveMarks={calendarDriveMarks}
                blockedDates={blockedDateMap}
                selectedDate={calendarDay}
                onSelectDate={setCalendarDay}
                showKindLegend
              />
              <div className="calendar-day-panel">
                <h4>{calendarDay ? `Schedule · ${calendarDay}` : "Select a day"}</h4>
                {calendarDay && (
                  <div className="card-list">
                    {blocksOnDay.map((block) => (
                      <article key={`b-${block.id}`} className="soft-card">
                        <strong>{block.title}</strong>
                        <p className="muted">
                          Blocked / exam
                          {block.reason ? ` · ${block.reason}` : ""}
                        </p>
                      </article>
                    ))}
                    {drivesOnDay.map((drive) => (
                      <article
                        key={drive.id}
                        className="soft-card cal-drive-card"
                        style={{ "--drive-color": driveColor(drive.id) }}
                      >
                        <div className="row-card" style={{ padding: 0, border: "none" }}>
                          <div>
                            <strong>
                              <span
                                className="cal-drive-swatch"
                                style={{ background: driveColor(drive.id) }}
                              />
                              {drive.is_mine ? "Your drive · " : ""}
                              {drive.title}
                            </strong>
                            <p className="muted">
                              {drive.is_mine
                                ? "You"
                                : drive.company_name || "Another company"}{" "}
                              · {drive.drive_time ? formatNiceTime(drive.drive_time) : "Time TBA"}{" "}
                              · {driveStatusLabel(drive.status)}
                            </p>
                            <p className="muted">
                              Branches: {drive.eligible_branches || "All"}
                            </p>
                          </div>
                          <StatusPill status={drive.status} />
                        </div>
                      </article>
                    ))}
                    {!drivesOnDay.length && !blocksOnDay.length && (
                      <EmptyState
                        title="Free day"
                        message="No drives or exam blocks on this date — a good slot to propose."
                        actionLabel="Propose drive"
                        onAction={() => {
                          if (isPastDate(calendarDay)) {
                            setMessage(pastDateError("Preferred date"));
                            return;
                          }
                          setForm((f) => ({ ...f, drive_date: calendarDay }));
                          setTab("post");
                        }}
                      />
                    )}
                  </div>
                )}
                {!calendarDay && (
                  <p className="muted">
                    Tap a marked day to see clashes before proposing a drive.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "post" && (
          <>
            <div className="panel-head">
              <h3>Propose a drive</h3>
              <p className="muted">
                Check Calendar first, then set a preferred date and time.
              </p>
            </div>
            <form className="grid-form surface-form" onSubmit={createDrive}>
              <label>
                Title
                <input value={form.title} onChange={update("title")} required />
              </label>
              <label>
                Role
                <input value={form.role} onChange={update("role")} />
              </label>
              <label>
                Package (LPA)
                <input
                  value={form.package_lpa}
                  onChange={update("package_lpa")}
                  type="number"
                  step="0.1"
                />
              </label>
              <label>
                Location
                <input value={form.location} onChange={update("location")} />
              </label>
              <label>
                Preferred date
                <input
                  value={form.drive_date}
                  onChange={update("drive_date")}
                  type="date"
                  min={minDate}
                />
                {isSunday(form.drive_date) ? (
                  <span className="warn-note field-hint">
                    Sunday — college permission needed; placement will confirm.
                  </span>
                ) : null}
              </label>
              <label>
                Preferred time
                <input value={form.drive_time} onChange={update("drive_time")} type="time" />
                {form.drive_time ? (
                  <span className="muted field-hint">{formatNiceTime(form.drive_time)}</span>
                ) : null}
              </label>
              <label>
                Deadline
                <input
                  value={form.deadline}
                  onChange={update("deadline")}
                  type="date"
                  min={minDate}
                />
              </label>
              <label className="full">
                Alternate dates & times
                <AlternateDatesField
                  value={form.alternate_dates}
                  min={minDate}
                  onChange={(next) => setForm({ ...form, alternate_dates: next })}
                />
              </label>
              <label>
                Min CGPA
                <input
                  value={form.min_cgpa}
                  onChange={update("min_cgpa")}
                  onKeyDown={cgpaKeyDown}
                  type="text"
                  inputMode="decimal"
                />
              </label>
              <label>
                Eligible branches
                <input value={form.eligible_branches} onChange={update("eligible_branches")} />
              </label>
              <label className="full">
                Description
                <textarea value={form.description} onChange={update("description")} rows={3} />
              </label>
              <button className="btn primary" type="submit">
                Submit for scheduling
              </button>
            </form>
          </>
        )}

        {tab === "applicants" && (
          <div className="applicants-sheet">
            <div className="applicants-toolbar">
              <h3>Applicants</h3>
              <select
                className="sheet-input applicants-drive-select"
                value={selectedDrive || ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setSelectedDrive(id);
                  setApplicantQuery("");
                  setSelectedApplicantIds([]);
                  setApplicantStatusFilter("all");
                  setApplicantRoundFilter("all");
                  loadApplicants(id);
                }}
                aria-label="Select drive"
              >
                <option value="">Select drive</option>
                {drives.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.applications_count ?? 0})
                  </option>
                ))}
              </select>
              <input
                className="sheet-input applicants-search"
                value={applicantQuery}
                onChange={(e) => setApplicantQuery(e.target.value)}
                placeholder="Search…"
                disabled={!selectedDrive}
              />
              <select
                className="sheet-input"
                value={applicantStatusFilter}
                onChange={(e) => setApplicantStatusFilter(e.target.value)}
                disabled={!selectedDrive}
                aria-label="Filter status"
              >
                <option value="all">All statuses</option>
                {APP_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                className="sheet-input"
                value={applicantRoundFilter}
                onChange={(e) => setApplicantRoundFilter(e.target.value)}
                disabled={!selectedDrive}
                aria-label="Filter round cleared"
              >
                <option value="all">Round: all</option>
                <option value="cleared">Cleared</option>
                <option value="pending">Pending clear</option>
              </select>
              <button
                className="btn ghost btn-xs"
                type="button"
                disabled={!selectedDrive}
                onClick={() => loadApplicants(selectedDrive)}
              >
                Refresh
              </button>
              <button
                className="btn ghost btn-xs"
                type="button"
                disabled={!selectedDrive || !visibleApplicants.length}
                onClick={exportApplicantsCsv}
              >
                CSV
              </button>
              {selectedDrive && (
                <span className="muted applicants-meta">
                  {selectedDriveMeta?.current_round_label || "—"} · {visibleApplicants.length}/
                  {applicants.length}
                  {applicantsUpdatedAt
                    ? ` · Live · ${new Date(applicantsUpdatedAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}`
                    : ""}
                </span>
              )}
            </div>

            {selectedDrive && selectedApplicantIds.length > 0 && (
              <div className="bulk-bar">
                <span>{selectedApplicantIds.length} selected</span>
                <select
                  className="sheet-input"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) bulkUpdate(v);
                    e.target.value = "";
                  }}
                  aria-label="Bulk status"
                >
                  <option value="" disabled>
                    Set status…
                  </option>
                  {APP_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost btn-xs"
                  type="button"
                  onClick={() =>
                    bulkUpdate({
                      status: "in_round",
                      attended: true,
                    })
                  }
                >
                  Mark attended
                </button>
                <button
                  className="btn ghost btn-xs"
                  type="button"
                  onClick={() => setSelectedApplicantIds([])}
                >
                  Clear
                </button>
              </div>
            )}

            {!selectedDrive && (
              <EmptyState
                title="Choose a drive"
                message="Pick a drive above, or open My drives and click a row."
                actionLabel={drives.length ? "My drives" : "Propose a drive"}
                onAction={() => setTab(drives.length ? "drives" : "post")}
              />
            )}

            {selectedDrive && !applicants.length && (
              <EmptyState
                title="No applicants yet"
                message={
                  selectedDriveMeta?.status === "proposed" ||
                  selectedDriveMeta?.status === "needs_reschedule"
                    ? "Students can apply after placement schedules this drive. Check Calendar or wait for approval."
                    : selectedDriveMeta?.status === "scheduled"
                      ? "Share the drive once placement has scheduled it — applicants will show up here as they apply."
                      : "No applications on this drive."
                }
                actionLabel={
                  selectedDriveMeta?.status === "proposed" ||
                  selectedDriveMeta?.status === "needs_reschedule"
                    ? "My drives"
                    : selectedDriveMeta?.status === "scheduled"
                      ? "Campus calendar"
                      : "Refresh"
                }
                onAction={() => {
                  if (
                    selectedDriveMeta?.status === "proposed" ||
                    selectedDriveMeta?.status === "needs_reschedule"
                  ) {
                    setTab("drives");
                  } else if (selectedDriveMeta?.status === "scheduled") {
                    setTab("calendar");
                  } else {
                    loadApplicants(selectedDrive);
                  }
                }}
              />
            )}

            {selectedDrive &&
              applicants.length > 0 &&
              !visibleApplicants.length && (
                <EmptyState
                  title="No matches"
                  message="Nothing matches your search or filters."
                  actionLabel="Clear filters"
                  onAction={() => {
                    setApplicantQuery("");
                    setApplicantStatusFilter("all");
                    setApplicantRoundFilter("all");
                  }}
                />
              )}

            {selectedDrive && applicants.length > 0 && visibleApplicants.length > 0 && (
              <>
              <div className="table-wrap sheet-wrap sheet-desktop">
                <table className="report-table sheet-table sheet-compact applicants-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            visibleApplicants.length > 0 &&
                            visibleApplicants.every((a) =>
                              selectedApplicantIds.includes(a.id)
                            )
                          }
                          onChange={toggleSelectAllVisible}
                          aria-label="Select all"
                        />
                      </th>
                      <th>
                        <button
                          type="button"
                          className="sort-th"
                          onClick={() => toggleApplicantSort("name")}
                        >
                          Student{sortMark("name")}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="sort-th"
                          onClick={() => toggleApplicantSort("branch")}
                        >
                          Branch{sortMark("branch")}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="sort-th"
                          onClick={() => toggleApplicantSort("cgpa")}
                        >
                          CGPA{sortMark("cgpa")}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="sort-th"
                          onClick={() => toggleApplicantSort("status")}
                        >
                          Status{sortMark("status")}
                        </button>
                      </th>
                      <th>Attended</th>
                      <th>Cleared</th>
                      <th>Resume</th>
                      <th>
                        <button
                          type="button"
                          className="sort-th"
                          onClick={() => toggleApplicantSort("offer")}
                        >
                          Offer{sortMark("offer")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleApplicants.map((app) => {
                      const drive = selectedDriveMeta;
                      const round = drive?.current_round;
                      const offerLabel = app.has_offer_letter
                        ? "Uploaded"
                        : app.status === "selected"
                          ? "Pending"
                          : "—";
                      return (
                        <tr
                          key={app.id}
                          className={
                            selectedApplicantIds.includes(app.id) ? "is-row-active" : ""
                          }
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedApplicantIds.includes(app.id)}
                              onChange={() => toggleApplicantSelect(app.id)}
                              aria-label={`Select ${app.student?.full_name || app.id}`}
                            />
                          </td>
                          <td>
                            <strong>{app.student?.full_name || "—"}</strong>
                          </td>
                          <td>{app.student?.branch || "—"}</td>
                          <td>{app.student?.cgpa ?? "—"}</td>
                          <td>
                            <select
                              className="sheet-input"
                              value={app.status || "applied"}
                              onChange={(e) => setStatus(app.id, e.target.value)}
                            >
                              {APP_STATUSES.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="btn ghost btn-xs"
                              type="button"
                              onClick={() =>
                                setStatus(app.id, {
                                  status: app.status,
                                  attended: !app.attended_current_round,
                                })
                              }
                            >
                              {app.attended_current_round ? "Yes" : "No"}
                            </button>
                          </td>
                          <td>
                            <button
                              className="btn ghost btn-xs"
                              type="button"
                              disabled={!round || round === "registration"}
                              onClick={() => {
                                if (!round || round === "registration") return;
                                setStatus(app.id, {
                                  status: app.status === "rejected" ? "in_round" : app.status,
                                  last_round_cleared: round,
                                });
                              }}
                            >
                              {app.last_round_cleared_label || "Mark"}
                            </button>
                          </td>
                          <td>
                            {app.student?.has_resume ? (
                              <span className="cta-row sheet-row-actions">
                                <button
                                  className="btn ghost btn-xs"
                                  type="button"
                                  onClick={() => openResumePreview(app)}
                                >
                                  View
                                </button>
                                <button
                                  className="btn ghost btn-xs"
                                  type="button"
                                  onClick={() =>
                                    downloadPdf(
                                      `/students/${app.student.id}/resume`,
                                      app.student.resume_original_name ||
                                        `${app.student.full_name || "student"}_resume.pdf`
                                    )
                                  }
                                >
                                  PDF
                                </button>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="offer-cell">
                            {app.status !== "selected" ? (
                              "—"
                            ) : (
                              <span className="offer-status-stack">
                                <span
                                  className={
                                    app.has_offer_letter
                                      ? "offer-badge is-uploaded"
                                      : "offer-badge is-pending"
                                  }
                                >
                                  {offerLabel}
                                </span>
                                {app.has_offer_letter ? (
                                  <button
                                    className="btn ghost btn-xs"
                                    type="button"
                                    onClick={() =>
                                      downloadPdf(
                                        `/applications/${app.id}/offer`,
                                        app.offer_original_name || "offer_letter.pdf"
                                      )
                                    }
                                  >
                                    Get
                                  </button>
                                ) : (
                                  <span className="offer-upload-inline">
                                    <input
                                      type="file"
                                      accept="application/pdf,.pdf"
                                      onChange={(e) =>
                                        setOfferFiles({
                                          ...offerFiles,
                                          [app.id]: e.target.files?.[0] || null,
                                        })
                                      }
                                    />
                                    <button
                                      className="btn primary btn-xs"
                                      type="button"
                                      onClick={() => uploadOffer(app.id)}
                                    >
                                      Up
                                    </button>
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sheet-mobile-cards">
                <div className="mobile-select-all">
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        visibleApplicants.length > 0 &&
                        visibleApplicants.every((a) => selectedApplicantIds.includes(a.id))
                      }
                      onChange={toggleSelectAllVisible}
                    />{" "}
                    Select all visible
                  </label>
                </div>
                {visibleApplicants.map((app) => {
                  const drive = selectedDriveMeta;
                  const round = drive?.current_round;
                  const offerLabel = app.has_offer_letter
                    ? "Uploaded"
                    : app.status === "selected"
                      ? "Pending"
                      : "—";
                  return (
                    <article
                      key={`m-app-${app.id}`}
                      className={`soft-card sheet-mobile-card${
                        selectedApplicantIds.includes(app.id) ? " is-row-active" : ""
                      }`}
                    >
                      <div className="row-card" style={{ padding: 0, border: "none" }}>
                        <label className="mobile-check">
                          <input
                            type="checkbox"
                            checked={selectedApplicantIds.includes(app.id)}
                            onChange={() => toggleApplicantSelect(app.id)}
                          />
                          <strong>{app.student?.full_name || "—"}</strong>
                        </label>
                        <span className="muted">
                          {app.student?.branch || "—"} · CGPA {app.student?.cgpa ?? "—"}
                        </span>
                      </div>
                      <label>
                        Status
                        <select
                          className="sheet-input"
                          value={app.status || "applied"}
                          onChange={(e) => setStatus(app.id, e.target.value)}
                        >
                          {APP_STATUSES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="sheet-actions-row">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            setStatus(app.id, {
                              status: app.status,
                              attended: !app.attended_current_round,
                            })
                          }
                        >
                          Attended: {app.attended_current_round ? "Yes" : "No"}
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={!round || round === "registration"}
                          onClick={() => {
                            if (!round || round === "registration") return;
                            setStatus(app.id, {
                              status: app.status === "rejected" ? "in_round" : app.status,
                              last_round_cleared: round,
                            });
                          }}
                        >
                          Cleared: {app.last_round_cleared_label || "Mark"}
                        </button>
                      </div>
                      <div className="sheet-actions-row">
                        {app.student?.has_resume ? (
                          <>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => openResumePreview(app)}
                            >
                              View resume
                            </button>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() =>
                                downloadPdf(
                                  `/students/${app.student.id}/resume`,
                                  app.student.resume_original_name ||
                                    `${app.student.full_name || "student"}_resume.pdf`
                                )
                              }
                            >
                              Download
                            </button>
                          </>
                        ) : (
                          <span className="muted">No resume</span>
                        )}
                      </div>
                      {app.status === "selected" && (
                        <div className="offer-status-stack">
                          <span
                            className={
                              app.has_offer_letter
                                ? "offer-badge is-uploaded"
                                : "offer-badge is-pending"
                            }
                          >
                            Offer: {offerLabel}
                          </span>
                          {app.has_offer_letter ? (
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() =>
                                downloadPdf(
                                  `/applications/${app.id}/offer`,
                                  app.offer_original_name || "offer_letter.pdf"
                                )
                              }
                            >
                              Get offer
                            </button>
                          ) : (
                            <span className="offer-upload-inline">
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={(e) =>
                                  setOfferFiles({
                                    ...offerFiles,
                                    [app.id]: e.target.files?.[0] || null,
                                  })
                                }
                              />
                              <button
                                className="btn primary"
                                type="button"
                                onClick={() => uploadOffer(app.id)}
                              >
                                Upload
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              </>
            )}

            {resumePreview && (
              <div className="resume-preview-overlay" role="dialog" aria-modal="true">
                <div className="resume-preview-panel">
                  <div className="resume-preview-head">
                    <strong>{resumePreview.name} — resume</strong>
                    <div className="cta-row">
                      <button
                        className="btn ghost btn-xs"
                        type="button"
                        onClick={() =>
                          downloadPdf(
                            `/students/${resumePreview.studentId}/resume`,
                            resumePreview.fileName
                          )
                        }
                      >
                        Download
                      </button>
                      <button className="btn ghost btn-xs" type="button" onClick={closeResumePreview}>
                        Close
                      </button>
                    </div>
                  </div>
                  <iframe
                    title="Resume preview"
                    src={resumePreview.url}
                    className="resume-preview-frame"
                  />
                </div>
              </div>
            )}
          </div>
        )}

      </section>
      )}

      {user?.is_approved !== false && tab !== "post" && (
        <button
          type="button"
          className="btn primary mobile-fab"
          onClick={() => setTab("post")}
        >
          Propose drive
        </button>
      )}
    </div>
  );
}
