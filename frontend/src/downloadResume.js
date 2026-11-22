import api from "./api";

export async function fetchPdfBlobUrl(url) {
  const response = await api.get(url, { responseType: "blob" });
  const blob = new Blob([response.data], { type: "application/pdf" });
  return window.URL.createObjectURL(blob);
}

export async function downloadPdf(url, fallbackName = "file.pdf") {
  const objectUrl = await fetchPdfBlobUrl(url);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

/** @deprecated use downloadPdf */
export async function downloadResume(url, fallbackName = "resume.pdf") {
  return downloadPdf(url, fallbackName);
}
