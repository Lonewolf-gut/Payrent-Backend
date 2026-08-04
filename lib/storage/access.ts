import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/lib/services/audit.service";
import { normalizeStoredFileReference } from "@/lib/storage/keys";
import { getPrivateFileAccessUrl, getPublicFileUrl } from "@/lib/storage/index";

export type FileAccessScope =
  | "kyc"
  | "financing"
  | "application"
  | "mandate"
  | "property-document"
  | "profile";

type AccessRequest =
  | { scope: "kyc"; documentId: string }
  | { scope: "financing"; documentId: string }
  | { scope: "application"; documentId: string }
  | { scope: "mandate"; mandateId: string }
  | { scope: "property-document"; fileKey: string }
  | { scope: "profile" };

async function assertKycDocumentAccess(documentId: string, userId: string, role: string) {
  const document = await prisma.kycDocument.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, fileUrl: true, fileName: true, documentType: true },
  });
  if (!document) throw new Error("Document not found.");

  const isOwner = document.userId === userId;
  const isReviewer = role === "ADMIN" || role === "COMPLIANCE_OFFICER";
  if (!isOwner && !isReviewer) throw new Error("You do not have access to this document.");

  return document;
}

async function assertFinancingDocumentAccess(documentId: string, userId: string, role: string) {
  const document = await prisma.tenantFinancingDocument.findUnique({
    where: { id: documentId },
    select: { id: true, tenantId: true, fileUrl: true, fileName: true, documentType: true },
  });
  if (!document) throw new Error("Document not found.");

  const tenant = await prisma.tenant.findUnique({
    where: { id: document.tenantId },
    select: { userId: true },
  });

  const isOwner = tenant?.userId === userId;
  const isReviewer = role === "ADMIN" || role === "COMPLIANCE_OFFICER";
  if (!isOwner && !isReviewer) throw new Error("You do not have access to this document.");

  return document;
}

async function assertApplicationDocumentAccess(documentId: string, userId: string, role: string) {
  const document = await prisma.applicationDocument.findUnique({
    where: { id: documentId },
    include: {
      application: {
        select: {
          tenant: { select: { userId: true } },
          property: { select: { landlord: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!document) throw new Error("Document not found.");

  const tenantUserId = document.application.tenant.userId;
  const merchantUserId = document.application.property.landlord.userId;
  const isOwner = tenantUserId === userId;
  const isMerchant = merchantUserId === userId;
  const isReviewer = role === "ADMIN" || role === "COMPLIANCE_OFFICER";
  if (!isOwner && !isMerchant && !isReviewer) {
    throw new Error("You do not have access to this document.");
  }

  return document;
}

async function assertMandateAccess(mandateId: string, userId: string, role: string) {
  const mandate = await prisma.mandate.findUnique({
    where: { id: mandateId },
    select: { id: true, tenantId: true, documentUrl: true },
  });
  if (!mandate?.documentUrl) throw new Error("Document not found.");

  const tenant = await prisma.tenant.findUnique({
    where: { id: mandate.tenantId },
    select: { userId: true },
  });

  const isOwner = tenant?.userId === userId;
  const isReviewer = role === "ADMIN" || role === "COMPLIANCE_OFFICER";
  if (!isOwner && !isReviewer) throw new Error("You do not have access to this document.");

  return mandate;
}

export async function resolveProtectedFileAccess(params: {
  request: AccessRequest;
  userId: string;
  role: string;
  appBaseUrl: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  let fileKey = "";
  let entity = "";
  let entityId = "";
  let fileName = "";

  switch (params.request.scope) {
    case "kyc": {
      const document = await assertKycDocumentAccess(
        params.request.documentId,
        params.userId,
        params.role
      );
      fileKey = normalizeStoredFileReference(document.fileUrl);
      entity = "KycDocument";
      entityId = document.id;
      fileName = document.fileName;
      break;
    }
    case "financing": {
      const document = await assertFinancingDocumentAccess(
        params.request.documentId,
        params.userId,
        params.role
      );
      fileKey = normalizeStoredFileReference(document.fileUrl);
      entity = "TenantFinancingDocument";
      entityId = document.id;
      fileName = document.fileName;
      break;
    }
    case "application": {
      const document = await assertApplicationDocumentAccess(
        params.request.documentId,
        params.userId,
        params.role
      );
      fileKey = normalizeStoredFileReference(document.fileUrl);
      entity = "ApplicationDocument";
      entityId = document.id;
      fileName = document.fileName;
      break;
    }
    case "mandate": {
      const mandate = await assertMandateAccess(
        params.request.mandateId,
        params.userId,
        params.role
      );
      fileKey = normalizeStoredFileReference(mandate.documentUrl!);
      entity = "Mandate";
      entityId = mandate.id;
      fileName = fileKey.split("/").pop() ?? "mandate-document";
      break;
    }
    case "property-document": {
      if (!["ADMIN", "COMPLIANCE_OFFICER", "MERCHANT"].includes(params.role)) {
        throw new Error("You do not have access to this document.");
      }
      fileKey = normalizeStoredFileReference(params.request.fileKey);
      entity = "PropertyDocument";
      entityId = fileKey;
      fileName = fileKey.split("/").pop() ?? "property-document";
      break;
    }
    case "profile": {
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { image: true },
      });
      if (!user?.image) throw new Error("Profile image not found.");
      fileKey = normalizeStoredFileReference(user.image);
      entity = "User";
      entityId = params.userId;
      fileName = "profile-image";
      break;
    }
  }

  const publicUrl = getPublicFileUrl(fileKey);
  const url =
    publicUrl ??
    (await getPrivateFileAccessUrl(fileKey, params.appBaseUrl));

  await auditService.log({
    userId: params.userId,
    action: "FILE_ACCESS",
    entity,
    entityId,
    metadata: { fileKey, fileName, scope: params.request.scope },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return {
    url,
    fileName,
    expiresInSeconds: Number(process.env.FILE_SIGNED_URL_TTL_SECONDS ?? "900"),
  };
}

export async function enrichDocumentWithAccessUrl<T extends { id: string; fileUrl: string }>(
  document: T,
  scope: Exclude<FileAccessScope, "mandate" | "property-document">,
  appBaseUrl: string,
  userId: string,
  role: string
) {
  try {
    const request =
      scope === "kyc"
        ? ({ scope: "kyc", documentId: document.id } as const)
        : scope === "financing"
          ? ({ scope: "financing", documentId: document.id } as const)
          : ({ scope: "application", documentId: document.id } as const);

    const access = await resolveProtectedFileAccess({
      request,
      userId,
      role,
      appBaseUrl,
    });

    return { ...document, accessUrl: access.url };
  } catch {
    return { ...document, accessUrl: null };
  }
}
