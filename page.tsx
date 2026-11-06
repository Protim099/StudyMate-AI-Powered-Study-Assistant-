"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(`/auth/${mode}`, form);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">📚 StudyMate</h1>
        <p className="text-sm text-slate-500">{mode === "login" ? "Log in to continue" : "Create your account"}</p>
        {mode === "register" && (
          <input className={input} placeholder="Name" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        )}
        <input className={input} type="email" placeholder="Email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password (min 8 chars)" required value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white disabled:opacity-50">
          {busy ? "Please wait..." : mode === "login" ? "Log in" : "Register"}
        </button>
        <button type="button" className="w-full text-sm text-indigo-600"
          onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "No account? Register" : "Have an account? Log in"}
        </button>
      </form>
    </main>
  );
}
