/** Keep readable photos when one file in a selection cannot be decoded. */
export async function prepareProfilePhotos(files: File[], prepare: (file: File) => Promise<string>, existingImages: string[] = []) {
  const results = await Promise.allSettled(files.map((file) => Promise.resolve().then(() => prepare(file))));
  const images: string[] = [];
  const failedNames: string[] = [];
  const seen = new Set(existingImages);
  let duplicateCount = 0;
  results.forEach((result, index) => {
    if (result.status === "rejected" || !result.value) failedNames.push(files[index].name);
    else if (seen.has(result.value)) duplicateCount++;
    else { seen.add(result.value); images.push(result.value); }
  });
  return { images, failedNames, duplicateCount };
}
