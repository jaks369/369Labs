import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Shield } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.listUsers.useQuery();
  const promoteMutation = trpc.admin.promoteToAdmin.useMutation({ onSuccess: () => listQuery.refetch() });
  const demoteMutation = trpc.admin.demoteToUser.useMutation({ onSuccess: () => listQuery.refetch() });
  const deleteMutation = trpc.admin.deleteUser.useMutation({ onSuccess: () => listQuery.refetch() });

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--text-muted)]">
        Access denied. Admin privileges required.
      </div>
    );
  }

  if (listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (listQuery.error) {
    return (
      <div className="p-6 text-red-500">
        Failed to load users: {listQuery.error.message}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5 text-[var(--amber)]" />
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
              <th className="pb-2 font-medium">ID</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Verified</th>
              <th className="pb-2 font-medium">Created</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.data?.users.map(u => (
              <tr key={u.id} className="border-b border-[var(--border)]/50">
                <td className="py-2.5">{u.id}</td>
                <td className="py-2.5">{u.email}</td>
                <td className="py-2.5">{u.name || "—"}</td>
                <td className="py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === "admin" ? "bg-[var(--amber)]/20 text-[var(--amber)]" : "bg-white/5 text-[var(--text-muted)]"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-2.5">{u.emailVerified ? "✓" : "✗"}</td>
                <td className="py-2.5 text-[var(--text-muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-2.5">
                  <div className="flex gap-2">
                    {u.role === "user" ? (
                      <button
                        onClick={() => promoteMutation.mutate({ userId: u.id })}
                        className="text-xs text-[var(--amber)] hover:underline"
                      >
                        Promote
                      </button>
                    ) : (
                      u.id !== user.id && (
                        <button
                          onClick={() => demoteMutation.mutate({ userId: u.id })}
                          className="text-xs text-yellow-500 hover:underline"
                        >
                          Demote
                        </button>
                      )
                    )}
                    {u.id !== user.id && (
                      <button
                        onClick={() => { if (confirm(`Delete user ${u.email}?`)) deleteMutation.mutate({ userId: u.id }); }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
