import React, { useState } from 'react';
import {
  Building2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const LoginScreen: React.FC = () => {
  const { state, loginWithCredentials } = useDMS();
  const { appMode, isFieldAppMode, allowedRoles } = usePWAInstall();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signingIn) return;
    setError(null);
    setSigningIn(true);
    try {
      const res = await loginWithCredentials(username, password, allowedRoles);
      if (!res.ok) {
        setError(res.error ?? 'Authentication failed.');
      }
    } catch {
      setError('Unable to verify credentials right now. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const modeSubtitle =
    appMode === 'salesman'
      ? 'Android App — Sales Representative Only'
      : appMode === 'distribution'
        ? 'Android App — Distribution Manager & Delivery'
        : isFieldAppMode
          ? 'Android Field App — Salesman, Distribution & Delivery'
          : 'Distribution Operations & Route Accounting (BDT)';

  const brandSuffix =
    appMode === 'salesman'
      ? 'Sales'
      : appMode === 'distribution'
        ? 'Dist'
        : isFieldAppMode
          ? 'Field'
          : 'DMS';

  const cardKicker =
    appMode === 'salesman'
      ? 'Android App · Salesman Portal'
      : appMode === 'distribution'
        ? 'Android App · Distribution Manager Portal'
        : isFieldAppMode
          ? 'Android Field App · Sales & Distribution'
          : 'Portal Sign In';

  const cardHeading =
    appMode === 'salesman'
      ? 'Salesman Sign In'
      : appMode === 'distribution'
        ? 'Distribution Manager Sign In'
        : isFieldAppMode
          ? 'Field Staff Sign In'
          : 'Sign in to your account';

  const cardHint =
    appMode === 'salesman'
      ? 'Sign in with your Sales Representative credentials assigned by your Administrator.'
      : appMode === 'distribution'
        ? 'Sign in with your Warehouse / Distribution Manager or Deliveryman credentials assigned by your Administrator.'
        : isFieldAppMode
          ? 'Sign in with your Sales Representative, Distribution Manager, or Deliveryman credentials.'
          : 'Enter the username and password assigned by your Administrator.';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            {state.companyProfile.logoDataUrl ? (
              <img
                src={state.companyProfile.logoDataUrl}
                alt={state.companyProfile.companyName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-contain border border-slate-200 bg-white p-0.5"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                {isFieldAppMode ? (
                  <Smartphone className="w-4 h-4" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
              </div>
            )}
            <span className="text-sm font-semibold text-slate-800">
              {state.companyProfile.companyName || 'aerofiy DMS'}
            </span>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <span className="text-xs font-medium text-slate-500 hidden md:inline">
              {modeSubtitle}
            </span>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-700 bg-clip-text text-transparent whitespace-nowrap select-none">
              aerofiy{' '}
              <span className="font-extrabold text-emerald-700">{brandSuffix}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5"
        >
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
              {cardKicker}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {cardHeading}
            </h1>
            <p className="text-xs text-slate-500">{cardHint}</p>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter username"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 text-sm font-mono text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-emerald-600 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {signingIn ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            {[
              state.companyProfile.companyName || 'aerofiy DMS',
              state.companyProfile.address,
              state.companyProfile.phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span>Currency: BDT (৳) · {state.companyProfile.website || 'dms.aerofiy.com'}</span>
        </div>
      </footer>
    </div>
  );
};
