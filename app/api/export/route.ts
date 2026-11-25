import { exportWorkspace } from "@/lib/data/settings";
import { ForbiddenError, getWorkspaceContext } from "@/lib/tenancy";

/** Everything in the workspace as JSON (DPDP Act: right to access your data). Owners only. */
export async function GET() {
  const ctx = await getWorkspaceContext();
  try {
    const data = await exportWorkspace(ctx);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="creatordesk-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(error.message, { status: 403 });
    throw error;
  }
}
