import Link from "next/link";

export default function Home() {
  // SELF_HEAL_TEST: intentional build break - will revert
  const x = ; // syntax error
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 sm:px-6 py-8 safe-area-padding">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">ProfessorX</h1>
        <p className="text-slate-500 text-sm sm:text-base mb-1">
          AI Factory Operator Console
        </p>
        <p className="text-slate-600 mb-6 sm:mb-8 text-base sm:text-lg max-w-lg">
          When an individual acquires great power, the use or misuse of that power is everything.
        </p>
        <p className="text-slate-500 text-sm mb-6">
          Orchestrate pipelines, manage initiatives, monitor graph health, and operate self-heal from one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
          <Link
            href="/login"
            className="min-h-[44px] flex items-center justify-center px-5 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors touch-manipulation"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="min-h-[44px] flex items-center justify-center px-5 py-3 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors touch-manipulation"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
