"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"signin" | "signup" | "magic">("signin");

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">ProfessorX</h1>
      <p className="text-slate-500 text-sm mb-1">AI Factory Operator Console</p>
      <p className="text-slate-600 mb-6">When an individual acquires great power, the use or misuse of that power is everything.</p>
      <p className="text-lg text-slate-700 mb-6">Sign in to your account</p>

      <div className="flex gap-2 mb-6">
        {(["signin", "signup", "magic"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === tab ? "bg-brand-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab === "magic" ? "Magic Link" : tab === "signin" ? "Sign In" : "Sign Up"}
          </button>
        ))}
      </div>

      <div className="w-full space-y-4">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <button className="w-full py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium">
          Sign In
        </button>
      </div>

      <p className="mt-6 text-slate-500 text-sm">Or continue with</p>
      <button className="mt-2 w-full py-2.5 border border-slate-300 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 bg-white text-slate-700">
        <span className="font-semibold text-slate-700">G</span> Google
      </button>

      <Link href="/" className="mt-8 inline-block text-brand-600 text-sm hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
