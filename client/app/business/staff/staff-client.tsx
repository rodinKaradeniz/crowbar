"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { StaffResponse } from "@/lib/api-client";
import { Mail, Pencil, Trash2, Users } from "lucide-react";
import { clientSendInvite, clientUpdateStaff, clientDeleteStaff } from "@/lib/client-api";
import { toast } from "sonner";

interface StaffClientProps {
  initialStaff: StaffResponse[];
}

export default function StaffClient({ initialStaff }: StaffClientProps) {
  const router = useRouter();
  const [staffMembers, setStaffMembers] = useState<StaffResponse[]>(initialStaff);
  const [editingStaff, setEditingStaff] = useState<StaffResponse | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffResponse | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "staff">("staff");

  // Edit form state
  const [editRole, setEditRole] = useState<"owner" | "manager" | "staff">("staff");

  const resetInviteForm = () => {
    setInviteEmail("");
    setRole("staff");
  };

  const handleInvite = () => {
    resetInviteForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (staff: StaffResponse) => {
    setEditingStaff(staff);
    setEditRole(staff.role as "owner" | "manager" | "staff");
    setIsDialogOpen(true);
  };

  const handleDelete = (staff: StaffResponse) => {
    setDeletingStaff(staff);
  };

  const handleConfirmDelete = async () => {
    if (deletingStaff) {
      try {
        await clientDeleteStaff(deletingStaff.id);
        setStaffMembers(staffMembers.filter((s) => s.id !== deletingStaff.id));
        setDeletingStaff(null);
        toast.success("Staff member removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete staff member");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingStaff) {
        await clientUpdateStaff(editingStaff.id, { role: editRole });
        setStaffMembers(
          staffMembers.map((s) =>
            s.id === editingStaff.id ? { ...s, role: editRole } : s
          )
        );
        toast.success("Staff member updated");
        setIsDialogOpen(false);
        setEditingStaff(null);
        router.refresh();
      } else {
        await clientSendInvite(inviteEmail, role);
        toast.success(`Invitation sent to ${inviteEmail}`);
        setIsDialogOpen(false);
        resetInviteForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadgeClass = (staffRole: string) => {
    switch (staffRole) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "manager":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-description">Manage your business staff members</p>
        </div>
        <Button onClick={handleInvite}>
          <Mail className="h-4 w-4 mr-2" />
          Invite Staff
        </Button>
      </div>

      {staffMembers.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No staff members yet</p>
          <Button onClick={handleInvite} variant="outline">
            <Mail className="h-4 w-4 mr-2" />
            Invite Your First Staff Member
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffMembers.map((staff) => (
            <div
              key={staff.id}
              className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {(staff.user_name || staff.role).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {staff.user_name || `Staff #${staff.id.slice(0, 8)}`}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${getRoleBadgeClass(
                        staff.role
                      )}`}
                    >
                      {staff.role}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(staff)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(staff)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                {staff.user_email && <div>{staff.user_email}</div>}
                {staff.user_phone && <div>{staff.user_phone}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setEditingStaff(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? "Edit Staff Member" : "Invite Staff Member"}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "Update this staff member's role"
                : "Send an invitation email to add a new staff member"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {editingStaff ? (
                <Field>
                  <FieldLabel>Role *</FieldLabel>
                  <Select value={editRole} onValueChange={(v) => setEditRole(v as typeof editRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>Role determines access permissions</FieldDescription>
                </Field>
              ) : (
                <>
                  <Field>
                    <FieldLabel>Email *</FieldLabel>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="staff@example.com"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Role *</FieldLabel>
                    <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Role determines access permissions</FieldDescription>
                  </Field>
                </>
              )}
            </FieldGroup>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? editingStaff ? "Saving..." : "Sending..."
                  : editingStaff ? "Update" : "Send Invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deletingStaff}
        onOpenChange={(open) => !open && setDeletingStaff(null)}
        title="Remove Staff Member"
        description="Are you sure you want to remove this staff member? They will lose access to the business dashboard."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}
