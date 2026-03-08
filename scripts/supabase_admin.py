#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
"""
Objectify Supabase Admin Tool

Usage:
    uv run scripts/supabase_admin.py <command> [options]

Commands:
    users                         List all users with credits
    user <email_or_id>            Show details for one user
    set-credits <email_or_id> <n> Set a user's credit balance
    reset-credits <n>             Set ALL users to n credits
    add-credits <email_or_id> <n> Add n credits to a user
    conversions [email_or_id]     List conversions (optionally for one user)
    transactions [email_or_id]    List credit transactions
    feedback [email_or_id]        List shared feedback submissions
    waitlist                      List waitlist entries
    storage                       Show storage bucket stats
    storage-files [user_id]       List files in diagram-images bucket
    delete-user <email_or_id>     Delete a user and all their data
    stats                         Show overall system stats
    sql <query>                   Run arbitrary SQL (careful!)

Environment:
    SUPABASE_ACCESS_TOKEN  - Supabase Management API token (sbp_...)
    SUPABASE_PROJECT_REF   - Project reference (default: lvmibmarrdrejomzurch)

Or create scripts/.env with these values.
"""

import json
import os
import sys
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Try loading .env from scripts/ directory
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "lvmibmarrdrejomzurch")
ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
MGMT_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"

if not ACCESS_TOKEN:
    print("Error: SUPABASE_ACCESS_TOKEN not set.", file=sys.stderr)
    print("Set it via environment or scripts/.env", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_client = httpx.Client(
    headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    },
    timeout=30,
)


def query(sql: str) -> list[dict]:
    """Run SQL via the Supabase Management API and return rows."""
    url = f"{MGMT_API}/database/query"
    resp = _client.post(url, json={"query": sql})
    if resp.status_code >= 400:
        print(f"API Error {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    result = resp.json()
    if isinstance(result, dict) and "message" in result:
        print(f"SQL Error: {result['message']}", file=sys.stderr)
        sys.exit(1)

    return result


def resolve_user(identifier: str) -> dict:
    """Resolve an email or UUID to a user profile row."""
    if "@" in identifier:
        rows = query(f"SELECT * FROM public.profiles WHERE email = '{identifier}'")
    else:
        rows = query(f"SELECT * FROM public.profiles WHERE id::text = '{identifier}' OR id::text LIKE '{identifier}%'")
    if not rows:
        print(f"User not found: {identifier}", file=sys.stderr)
        sys.exit(1)
    if len(rows) > 1:
        print(f"Ambiguous — matched {len(rows)} users. Be more specific.", file=sys.stderr)
        for r in rows:
            print(f"  {r['id']}  {r['email']}", file=sys.stderr)
        sys.exit(1)
    return rows[0]


def print_table(rows: list[dict], columns: list[str] | None = None):
    """Pretty-print rows as an aligned table."""
    if not rows:
        print("(no results)")
        return
    if columns is None:
        columns = list(rows[0].keys())
    widths = {c: max(len(c), max(len(str(r.get(c, ""))) for r in rows)) for c in columns}
    header = " | ".join(c.ljust(widths[c]) for c in columns)
    sep = "-+-".join("-" * widths[c] for c in columns)
    print(header)
    print(sep)
    for r in rows:
        print(" | ".join(str(r.get(c, "")).ljust(widths[c]) for c in columns))


def truncate(s: str, n: int = 60) -> str:
    s = str(s).replace("\n", " ")
    return s[:n] + "..." if len(s) > n else s


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_users():
    """List all users with credits and signup info."""
    rows = query("""
        SELECT p.id, p.email, p.credits, p.created_at,
               u.raw_app_meta_data->>'provider' as provider,
               u.last_sign_in_at
        FROM public.profiles p
        LEFT JOIN auth.users u ON p.id = u.id
        ORDER BY p.created_at
    """)
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
        r["last_sign_in_at"] = r["last_sign_in_at"][:16] if r.get("last_sign_in_at") else ""
    print_table(rows, ["id", "email", "credits", "provider", "created_at", "last_sign_in_at"])
    print(f"\nTotal: {len(rows)} users")


def cmd_user(identifier: str):
    """Show detailed info for one user."""
    user = resolve_user(identifier)
    uid = user["id"]

    print(f"=== User: {user['email']} ===")
    print(f"  ID:       {uid}")
    print(f"  Credits:  {user['credits']}")
    print(f"  Created:  {user['created_at']}")

    # Conversion count
    convs = query(f"SELECT count(*) as n, count(*) FILTER (WHERE status = 'completed') as completed, count(*) FILTER (WHERE status = 'failed') as failed FROM public.conversions WHERE user_id = '{uid}'")
    c = convs[0] if convs else {}
    print(f"\n  Conversions: {c.get('n', 0)} total ({c.get('completed', 0)} completed, {c.get('failed', 0)} failed)")

    # Credit transactions
    txns = query(f"SELECT amount, reason, created_at FROM public.credit_transactions WHERE user_id = '{uid}' ORDER BY created_at DESC LIMIT 10")
    if txns:
        print(f"\n  Recent credit transactions:")
        for t in txns:
            print(f"    {t['created_at'][:16]}  {t['amount']:+d}  {t.get('reason', '')}")

    # Feedback count
    fb = query(f"SELECT count(*) as n FROM public.shared_feedback WHERE user_id = '{uid}'")
    print(f"\n  Feedback submissions: {fb[0]['n'] if fb else 0}")

    # Storage files
    files = query(f"SELECT name, (metadata->>'size')::bigint as size_bytes FROM storage.objects WHERE bucket_id = 'diagram-images' AND name LIKE '{uid}/%' ORDER BY created_at DESC LIMIT 5")
    if files:
        print(f"\n  Recent uploads:")
        for f in files:
            size_kb = round(int(f.get("size_bytes") or 0) / 1024)
            print(f"    {f['name']}  ({size_kb} KB)")


def cmd_set_credits(identifier: str, n: int):
    """Set a user's credit balance to exactly n."""
    user = resolve_user(identifier)
    query(f"UPDATE public.profiles SET credits = {n} WHERE id = '{user['id']}'")
    print(f"Set {user['email']} credits to {n}")


def cmd_reset_credits(n: int):
    """Set ALL users' credits to n."""
    rows = query(f"UPDATE public.profiles SET credits = {n}; SELECT id, email, credits FROM public.profiles;")
    print(f"Reset all users to {n} credits:")
    print_table(rows, ["email", "credits"])


def cmd_add_credits(identifier: str, n: int):
    """Add n credits to a user (can be negative to subtract)."""
    user = resolve_user(identifier)
    uid = user["id"]
    query(f"""
        UPDATE public.profiles SET credits = credits + {n} WHERE id = '{uid}';
        INSERT INTO public.credit_transactions (user_id, amount, reason)
        VALUES ('{uid}', {n}, 'admin_adjustment');
    """)
    updated = query(f"SELECT credits FROM public.profiles WHERE id = '{uid}'")
    new_balance = updated[0]["credits"] if updated else "?"
    print(f"Added {n} credits to {user['email']}. New balance: {new_balance}")


def cmd_conversions(identifier: str | None = None):
    """List conversions, optionally filtered to one user."""
    where = ""
    if identifier:
        user = resolve_user(identifier)
        where = f"WHERE c.user_id = '{user['id']}'"

    rows = query(f"""
        SELECT c.id, p.email, c.status,
               c.image_url,
               c.spec->'diagrams'->0->>'title' as title,
               c.created_at
        FROM public.conversions c
        LEFT JOIN public.profiles p ON c.user_id = p.id
        {where}
        ORDER BY c.created_at DESC
        LIMIT 50
    """)
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
        r["title"] = truncate(r.get("title") or "", 30)
        r["image_url"] = truncate(r.get("image_url") or "", 30)
    print_table(rows, ["id", "email", "status", "title", "image_url", "created_at"])
    print(f"\nShowing {len(rows)} conversions")


def cmd_transactions(identifier: str | None = None):
    """List credit transactions."""
    where = ""
    if identifier:
        user = resolve_user(identifier)
        where = f"WHERE t.user_id = '{user['id']}'"

    rows = query(f"""
        SELECT t.id, p.email, t.amount, t.reason, t.created_at
        FROM public.credit_transactions t
        LEFT JOIN public.profiles p ON t.user_id = p.id
        {where}
        ORDER BY t.created_at DESC
        LIMIT 50
    """)
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
    print_table(rows, ["email", "amount", "reason", "created_at"])


def cmd_feedback(identifier: str | None = None):
    """List shared feedback submissions."""
    where = ""
    if identifier:
        user = resolve_user(identifier)
        where = f"WHERE f.user_id = '{user['id']}'"

    rows = query(f"""
        SELECT f.id, p.email, f.document_title,
               f.user_comment,
               jsonb_array_length(COALESCE(f.chat_history, '[]'::jsonb)) as chat_msgs,
               f.created_at
        FROM public.shared_feedback f
        LEFT JOIN public.profiles p ON f.user_id = p.id
        {where}
        ORDER BY f.created_at DESC
        LIMIT 50
    """)
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
        r["user_comment"] = truncate(r.get("user_comment") or "", 40)
        r["document_title"] = truncate(r.get("document_title") or "", 25)
    print_table(rows, ["email", "document_title", "user_comment", "chat_msgs", "created_at"])


def cmd_waitlist():
    """List waitlist entries."""
    rows = query("SELECT id, email, desired_credits, willing_to_pay, created_at FROM public.waitlist ORDER BY created_at DESC")
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
    print_table(rows, ["email", "desired_credits", "willing_to_pay", "created_at"])
    print(f"\nTotal: {len(rows)} entries")


def cmd_storage():
    """Show storage bucket stats."""
    buckets = query("SELECT id, name, public, created_at FROM storage.buckets")
    for b in buckets:
        b["created_at"] = b["created_at"][:16] if b.get("created_at") else ""
    print("Buckets:")
    print_table(buckets, ["id", "name", "public", "created_at"])

    files = query("""
        SELECT
            count(*) as total_files,
            count(DISTINCT (string_to_array(name, '/'))[1]) as unique_users,
            pg_size_pretty(sum((metadata->>'size')::bigint)) as total_size
        FROM storage.objects
        WHERE bucket_id = 'diagram-images'
    """)
    if files:
        f = files[0]
        print(f"\ndiagram-images bucket:")
        print(f"  Files:  {f['total_files']}")
        print(f"  Users:  {f['unique_users']}")
        print(f"  Size:   {f['total_size']}")


def cmd_storage_files(user_id: str | None = None):
    """List files in diagram-images bucket."""
    where = f"AND name LIKE '{user_id}/%'" if user_id else ""
    rows = query(f"""
        SELECT name,
               (metadata->>'size')::bigint as size_bytes,
               metadata->>'mimetype' as mime,
               created_at
        FROM storage.objects
        WHERE bucket_id = 'diagram-images' {where}
        ORDER BY created_at DESC
        LIMIT 50
    """)
    for r in rows:
        r["created_at"] = r["created_at"][:16] if r.get("created_at") else ""
        r["size_kb"] = round(int(r.get("size_bytes") or 0) / 1024)
        del r["size_bytes"]
    print_table(rows, ["name", "size_kb", "mime", "created_at"])


def cmd_delete_user(identifier: str):
    """Delete a user and all their data (profiles, conversions, transactions, feedback, storage, auth)."""
    user = resolve_user(identifier)
    uid = user["id"]
    email = user["email"]

    print(f"About to DELETE user: {email} ({uid})")
    print("This will remove: profile, conversions, credit transactions, feedback, storage files, auth record")
    confirm = input("Type the email to confirm: ").strip()
    if confirm != email:
        print("Aborted.")
        return

    # Delete storage files
    query(f"DELETE FROM storage.objects WHERE bucket_id = 'diagram-images' AND name LIKE '{uid}/%'")
    # Delete user data (cascades from profiles → conversions, credit_transactions, shared_feedback)
    query(f"DELETE FROM public.profiles WHERE id = '{uid}'")
    # Delete auth user
    query(f"DELETE FROM auth.users WHERE id = '{uid}'")
    print(f"Deleted user {email}")


def cmd_stats():
    """Show overall system stats."""
    users = query("SELECT count(*) as n, sum(credits) as total_credits FROM public.profiles")
    convs = query("""
        SELECT count(*) as total,
               count(*) FILTER (WHERE status = 'completed') as completed,
               count(*) FILTER (WHERE status = 'failed') as failed,
               count(*) FILTER (WHERE status = 'processing') as processing
        FROM public.conversions
    """)
    txns = query("SELECT count(*) as n, sum(amount) as net FROM public.credit_transactions")
    fb = query("SELECT count(*) as n FROM public.shared_feedback")
    wl = query("SELECT count(*) as n FROM public.waitlist")
    storage = query("""
        SELECT count(*) as files,
               pg_size_pretty(COALESCE(sum((metadata->>'size')::bigint), 0)) as size
        FROM storage.objects WHERE bucket_id = 'diagram-images'
    """)

    u = users[0] if users else {}
    c = convs[0] if convs else {}
    t = txns[0] if txns else {}
    s = storage[0] if storage else {}

    print("=== Objectify Stats ===")
    print(f"  Users:        {u.get('n', 0)} ({u.get('total_credits', 0)} total credits remaining)")
    print(f"  Conversions:  {c.get('total', 0)} ({c.get('completed', 0)} ok, {c.get('failed', 0)} failed, {c.get('processing', 0)} processing)")
    print(f"  Transactions: {t.get('n', 0)} (net: {t.get('net', 0)} credits)")
    print(f"  Feedback:     {fb[0].get('n', 0) if fb else 0}")
    print(f"  Waitlist:     {wl[0].get('n', 0) if wl else 0}")
    print(f"  Storage:      {s.get('files', 0)} files, {s.get('size', '0 bytes')}")


def cmd_sql(sql: str):
    """Run arbitrary SQL."""
    rows = query(sql)
    if isinstance(rows, list) and rows:
        print_table(rows)
    elif isinstance(rows, list):
        print("(query returned no rows)")
    else:
        print(json.dumps(rows, indent=2))


# ---------------------------------------------------------------------------
# CLI dispatcher
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return

    cmd = args[0]

    try:
        if cmd == "users":
            cmd_users()
        elif cmd == "user" and len(args) >= 2:
            cmd_user(args[1])
        elif cmd == "set-credits" and len(args) >= 3:
            cmd_set_credits(args[1], int(args[2]))
        elif cmd == "reset-credits" and len(args) >= 2:
            cmd_reset_credits(int(args[1]))
        elif cmd == "add-credits" and len(args) >= 3:
            cmd_add_credits(args[1], int(args[2]))
        elif cmd == "conversions":
            cmd_conversions(args[1] if len(args) >= 2 else None)
        elif cmd == "transactions":
            cmd_transactions(args[1] if len(args) >= 2 else None)
        elif cmd == "feedback":
            cmd_feedback(args[1] if len(args) >= 2 else None)
        elif cmd == "waitlist":
            cmd_waitlist()
        elif cmd == "storage":
            cmd_storage()
        elif cmd == "storage-files":
            cmd_storage_files(args[1] if len(args) >= 2 else None)
        elif cmd == "delete-user" and len(args) >= 2:
            cmd_delete_user(args[1])
        elif cmd == "stats":
            cmd_stats()
        elif cmd == "sql" and len(args) >= 2:
            cmd_sql(" ".join(args[1:]))
        else:
            print(f"Unknown command or missing args: {cmd}")
            print("Run with --help for usage.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\nAborted.")


if __name__ == "__main__":
    main()
