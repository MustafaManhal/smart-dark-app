/** The sample book that comes with the app (two pages that show what smart dark does). */
export async function loadSample(): Promise<File> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
  if (!response.ok) throw new Error("The sample book could not be loaded.");
  return new File([await response.blob()], "sample.pdf", { type: "application/pdf" });
}
