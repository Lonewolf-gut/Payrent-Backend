export function isApprovedListingStatus(status?: string | null) {
  return status === "ACTIVE" || status === "RENTED";
}

export function listingApprovalLabel(status?: string | null) {
  if (isApprovedListingStatus(status)) return "Approved";
  if (status === "INACTIVE") return "Not approved";
  return "Pending";
}
