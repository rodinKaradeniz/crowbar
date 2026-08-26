"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Mail, Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffResponse } from "@/lib/api-client";
import {
  clientDeleteStaff,
  clientListInvitations,
  clientResendInvitation,
  clientRevokeInvitation,
  clientSendInvite,
  clientUpdateStaff,
  type StaffInvitation,
} from "@/lib/client-api";

import {
  hasCapability,
  manageableRoles,
  roleLabel,
  type StaffRole,
} from "@/lib/permissions";

interface StaffClientProps {
  initialStaff: StaffResponse[];
  currentUserId: string;
  currentRole: StaffRole;
}

export default function StaffClient({
  initialStaff,
  currentUserId,
  currentRole,
}: StaffClientProps) {
  const router = useRouter();
  const canAdminister = hasCapability(currentRole, "staff.manage");
  // Mirrors ROLE_MANAGEMENT_AUTHORITY: an owner assigns any role, a manager
  // only the three operational ones, so a manager cannot promote to their own
  // level. staff_service.assert_can_manage_role enforces the same server-side.
  const assignableRoles = manageableRoles(currentRole);
  const [staffMembers, setStaffMembers] = useState(initialStaff);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [editingStaff, setEditingStaff] = useState<StaffResponse | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffResponse | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionInvitationId, setActionInvitationId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const defaultRole: StaffRole = assignableRoles[0] ?? "host_server";
  const [role, setRole] = useState<StaffRole>(defaultRole);
  const [editRole, setEditRole] = useState<StaffRole>(defaultRole);

  useEffect(() => {
    if (!canAdminister) return;
    let active = true;
    clientListInvitations()
      .then((values) => {
        if (active) setInvitations(values);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load invitations");
      });
    return () => {
      active = false;
    };
  }, [canAdminister]);

  const canManageMember = (member: StaffResponse) => {
    if (member.user_id === currentUserId) return false;
    return assignableRoles.includes(member.role as StaffRole);
  };

  const handleInvite = () => {
    setEditingStaff(null);
    setInviteEmail("");
    setRole(defaultRole);
    setIsDialogOpen(true);
  };

  const handleEdit = (member: StaffResponse) => {
    setEditingStaff(member);
    setEditRole(member.role as StaffRole);
    setIsDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingStaff) return;
    try {
      await clientDeleteStaff(deletingStaff.id);
      setStaffMembers((members) => members.filter((member) => member.id !== deletingStaff.id));
      toast.success("Staff access removed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove staff access");
    } finally {
      setDeletingStaff(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingStaff) {
        const updated = await clientUpdateStaff(editingStaff.id, { role: editRole });
        setStaffMembers((members) =>
          members.map((member) =>
            member.id === editingStaff.id ? { ...member, role: updated.role } : member,
          ),
        );
        toast.success("Staff role updated; existing sessions were revoked");
      } else {
        const invitation = await clientSendInvite(inviteEmail, role);
        setInvitations((values) => [invitation, ...values]);
        if (invitation.deliveryStatus === "sent") {
          toast.success(`Invitation sent to ${invitation.email}`);
        } else {
          toast.warning("Invitation saved, but email delivery failed. You can retry below.");
        }
      }
      setIsDialogOpen(false);
      setEditingStaff(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvitationAction = async (
    invitation: StaffInvitation,
    action: "resend" | "revoke",
  ) => {
    setActionInvitationId(invitation.id);
    try {
      const updated =
        action === "resend"
          ? await clientResendInvitation(invitation.id)
          : await clientRevokeInvitation(invitation.id);
      setInvitations((values) =>
        values.map((value) => (value.id === updated.id ? updated : value)),
      );
      if (action === "revoke") {
        toast.success("Invitation revoked");
      } else if (updated.deliveryStatus === "sent") {
        toast.success("Invitation resent");
      } else {
        toast.warning("Invitation refreshed, but email delivery failed again");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} invitation`);
    } finally {
      setActionInvitationId(null);
    }
  };

  const roleBadgeClass = (value: string) => {
    if (value === "owner") {
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    }
    if (value === "manager") {
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    }
    if (value === "inventory_operator") {
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    }
    if (value === "bar_kitchen") {
      return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  };

  const pendingInvitations = invitations.filter(
    (invitation) => !invitation.acceptedAt && !invitation.revokedAt,
  );

  return (
    <div className="page-container space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-description">
            {canAdminister ? "Manage staff access and invitations" : "View your business team"}
          </p>
        </div>
        {canAdminister && (
          <Button onClick={handleInvite}>
            <Mail className="mr-2 h-4 w-4" />
            Invite staff
          </Button>
        )}
      </div>

      {staffMembers.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No staff members found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {staffMembers.map((member) => (
            <div key={member.id} className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <span className="text-sm font-medium">
                      {(member.user_name || member.role).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">
                      {member.user_name || `Staff #${member.id.slice(0, 8)}`}
                      {member.user_id === currentUserId ? " (you)" : ""}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${roleBadgeClass(member.role)}`}>
                      {roleLabel(member.role)}
                    </span>
                  </div>
                </div>
                {canManageMember(member) && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" aria-label="Edit role" onClick={() => handleEdit(member)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="destructive" aria-label="Remove staff access" onClick={() => setDeletingStaff(member)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                {member.user_email && <div className="truncate">{member.user_email}</div>}
                {member.user_phone && <div>{member.user_phone}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {canAdminister && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Pending invitations</h2>
            <p className="text-sm text-muted-foreground">Delivery status is shown separately from invitation validity.</p>
          </div>
          {pendingInvitations.length === 0 ? (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="font-medium">{invitation.email}</div>
                    <div className="text-sm text-muted-foreground">
                      <span>{roleLabel(invitation.role)}</span>
                      {" · "}
                      {invitation.deliveryStatus === "sent" ? "Email sent" : "Email delivery failed"}
                    </div>
                    {invitation.deliveryError && (
                      <div className="mt-1 text-sm text-destructive">{invitation.deliveryError}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={actionInvitationId === invitation.id} onClick={() => handleInvitationAction(invitation, "resend")}>
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Resend
                    </Button>
                    <Button variant="outline" size="sm" disabled={actionInvitationId === invitation.id} onClick={() => handleInvitationAction(invitation, "revoke")}>
                      <Ban className="mr-2 h-3 w-3" />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setEditingStaff(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit staff role" : "Invite staff member"}</DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "The member will need to sign in again after this change."
                : "Create a seven-day invitation and attempt email delivery."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {!editingStaff && (
                <Field>
                  <FieldLabel>Email *</FieldLabel>
                  <Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
                </Field>
              )}
              <Field>
                <FieldLabel>Role *</FieldLabel>
                <Select
                  value={editingStaff ? editRole : role}
                  onValueChange={(value) => {
                    if (editingStaff) setEditRole(value as StaffRole);
                    else setRole(value as StaffRole);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((assignableRole) => (
                      <SelectItem key={assignableRole} value={assignableRole}>
                        {roleLabel(assignableRole)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Owners may assign any role. Managers may assign the host/server,
                  bar/kitchen and inventory operator roles, but not owner or manager.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : editingStaff ? "Update role" : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deletingStaff}
        onOpenChange={(open) => !open && setDeletingStaff(null)}
        title="Remove staff access"
        description="This immediately disables the account and revokes its active sessions."
        confirmLabel="Remove access"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}
