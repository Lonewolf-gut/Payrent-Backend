import {
  deleteStoredFile,
  getPublicFileUrl,
  saveDocumentUpload,
  saveMandateUpload,
  savePropertyDocumentUpload,
  savePropertyImageUpload,
  storeUploadedFile,
} from "@/lib/storage";

export async function saveApplicationDocument(file: File, ownerId: string) {
  return saveDocumentUpload(file, "applications", ownerId);
}

export async function saveFinancingDocument(file: File, ownerId: string) {
  return saveDocumentUpload(file, "financing-docs", ownerId);
}

export async function saveKycDocument(file: File, ownerId: string) {
  return saveDocumentUpload(file, "kyc", ownerId);
}

export { saveMandateUpload, savePropertyDocumentUpload, savePropertyImageUpload };

export async function saveProfileImage(file: File, ownerId: string) {
  const stored = await storeUploadedFile({
    file,
    category: "profiles",
    ownerId,
    kind: "image",
  });
  return stored.key;
}

export { deleteStoredFile };
