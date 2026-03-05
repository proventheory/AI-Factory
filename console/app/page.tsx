import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">ProfessorX</h1>
      <p className="text-slate-600 mb-8">When an individual acquires great power, the use or misuse of that power is everything.</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
