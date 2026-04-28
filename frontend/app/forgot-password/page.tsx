'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail,
    ArrowLeft,
    Eye,
    EyeOff,
    Check,
    X,
    Loader2,
    Timer,
    CheckCircle,
    XCircle
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// ─── Types ───
type ForgotPasswordState =
    | { step: 'request' }
    | { step: 'confirmation'; email: string }
    | { step: 'reset'; token: string }
    | { step: 'expired' };

interface PasswordRequirements {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
}

// ─── Animation Variants ───
// Use tuple type for cubic-bezier to satisfy Framer Motion's Easing type
const easeOutQuad: [number, number, number, number] = [0.4, 0, 0.2, 1];

const pageTransition = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.3, ease: easeOutQuad }
};

const staggerContainer = {
    animate: { transition: { staggerChildren: 0.08 } }
};

const staggerItem = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25 }
};

// ─── Password Strength Logic ───
function checkPasswordStrength(password: string): { score: number; requirements: PasswordRequirements } {
    const requirements: PasswordRequirements = {
        minLength: password.length >= 8,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };

    const score = Object.values(requirements).filter(Boolean).length;
    return { score, requirements };
}

function getStrengthColor(score: number): string {
    if (score <= 2) return 'bg-red-500';
    if (score <= 3) return 'bg-amber-500';
    if (score <= 4) return 'bg-blue-500';
    return 'bg-[#00C9C8]'; // brand-cyan
}

function getStrengthLabel(score: number): string {
    if (score <= 2) return 'Weak';
    if (score <= 3) return 'Fair';
    if (score <= 4) return 'Good';
    return 'Strong';
}

// ─── Main Component ───
export default function ForgotPasswordPage() {
    const searchParams = useSearchParams();
    const [state, setState] = useState<ForgotPasswordState>({ step: 'request' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check for token on mount
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            // Validate token format (JWT-like structure check)
            const isValidFormat = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*$/.test(token);
            if (isValidFormat) {
                setState({ step: 'reset', token });
            } else {
                setState({ step: 'expired' });
            }
        }
    }, [searchParams]);

    return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 py-12 font-[var(--font-sora)]">
            <div className="w-full max-w-md">
                {/* Logo */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-center mb-10"
                >
                    <Link href="/" className="inline-block">
                        <span className="text-3xl font-bold tracking-tight">
                            <span className="text-[#00C9C8]">SMS</span>
                            <span className="text-white">VIBES</span>
                        </span>
                    </Link>
                </motion.div>

                {/* Card Container */}
                <motion.div
                    className="bg-[#1E293B] border border-[#334155] rounded-xl p-8 shadow-2xl shadow-black/20"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                >
                    <AnimatePresence mode="wait">
                        {state.step === 'request' && (
                            <RequestStep
                                key="request"
                                onSubmit={async (email) => {
                                    setIsLoading(true);
                                    setError(null);
                                    try {
                                        const res = await fetch('/api/auth/forgot-password', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email }),
                                        });

                                        // Security rule: Always show success regardless of email existence
                                        // But we still check network errors
                                        if (!res.ok && res.status !== 200 && res.status !== 404) {
                                            throw new Error('Something went wrong. Please try again.');
                                        }

                                        setState({ step: 'confirmation', email });
                                    } catch (err) {
                                        setError(err instanceof Error ? err.message : 'An error occurred');
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                isLoading={isLoading}
                                error={error}
                            />
                        )}

                        {state.step === 'confirmation' && (
                            <ConfirmationStep
                                key="confirmation"
                                email={state.email}
                                onResend={async () => {
                                    setIsLoading(true);
                                    try {
                                        await fetch('/api/auth/forgot-password', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email: state.email }),
                                        });
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                isLoading={isLoading}
                            />
                        )}

                        {state.step === 'reset' && (
                            <ResetStep
                                key="reset"
                                token={state.token}
                                onSuccess={() => setState({ step: 'request' })}
                            />
                        )}

                        {state.step === 'expired' && (
                            <ExpiredStep
                                key="expired"
                                onBack={() => setState({ step: 'request' })}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Back to Login */}
                <motion.p
                    className="text-center mt-6 text-sm text-[#94A3B8]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    Remember your password?{' '}
                    <Link href="/login" className="text-[#00C9C8] hover:text-[#00C9C8]/80 font-medium transition-colors">
                        Sign in
                    </Link>
                </motion.p>
            </div>
        </div>
    );
}

// ─── Step 1: Request ───
function RequestStep({
    onSubmit,
    isLoading,
    error
}: {
    onSubmit: (email: string) => void;
    isLoading: boolean;
    error: string | null;
}) {
    const [email, setEmail] = useState('');

    return (
        <motion.div {...pageTransition}>
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
                <p className="text-[#94A3B8] text-sm">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (email.trim()) onSubmit(email.trim());
                }}
                className="space-y-4"
            >
                <div>
                    <label className="block text-sm font-medium text-[#F1F5F9] mb-2">
                        Email Address
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full bg-[#0F172A] border border-[#334155] rounded-lg pl-10 pr-4 py-3 text-white placeholder-[#64748B] focus:outline-none focus:border-[#00C9C8] focus:ring-1 focus:ring-[#00C9C8] transition-all"
                        />
                    </div>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2"
                    >
                        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400">{error}</p>
                    </motion.div>
                )}

                <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full bg-[#00C9C8] hover:bg-[#00C9C8]/90 disabled:bg-[#334155] disabled:text-[#64748B] text-[#1A1040] font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        'Send Reset Link'
                    )}
                </button>
            </form>
        </motion.div>
    );
}

// ─── Step 2: Confirmation ───
function ConfirmationStep({
    email,
    onResend,
    isLoading
}: {
    email: string;
    onResend: () => void;
    isLoading: boolean;
}) {
    const [cooldown, setCooldown] = useState(60);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (cooldown > 0) {
            timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [cooldown]);

    const handleResend = () => {
        if (cooldown > 0) return;
        setCooldown(60);
        onResend();
    };

    return (
        <motion.div {...pageTransition} className="text-center">
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                className="w-20 h-20 bg-[#00C9C8]/10 rounded-full flex items-center justify-center mx-auto mb-6"
            >
                <Mail className="w-10 h-10 text-[#00C9C8]" />
            </motion.div>

            <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
            <p className="text-[#94A3B8] mb-2">
                We&apos;ve sent a password reset link to
            </p>
            <p className="text-[#00C9C8] font-mono text-sm mb-8 break-all">
                {email}
            </p>

            <div className="space-y-4">
                <button
                    onClick={handleResend}
                    disabled={cooldown > 0 || isLoading}
                    className="w-full border border-[#334155] hover:border-[#00C9C8] disabled:border-[#1E293B] text-[#00C9C8] disabled:text-[#475569] font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : cooldown > 0 ? (
                        <>
                            <Timer className="w-5 h-5" />
                            Resend in {cooldown}s
                        </>
                    ) : (
                        'Resend Email'
                    )}
                </button>

                <Link
                    href="/login"
                    className="w-full inline-flex items-center justify-center gap-2 text-[#94A3B8] hover:text-white transition-colors text-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sign In
                </Link>
            </div>
        </motion.div>
    );
}

// ─── Step 3: Reset Password ───
function ResetStep({
    token,
    onSuccess
}: {
    token: string;
    onSuccess: () => void;
}) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const { score, requirements } = checkPasswordStrength(password);
    const strengthColor = getStrengthColor(score);
    const strengthLabel = getStrengthLabel(score);

    const allRequirementsMet = Object.values(requirements).every(Boolean);
    const passwordsMatch = password === confirmPassword && password !== '';
    const canSubmit = allRequirementsMet && passwordsMatch && !isLoading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 400 && data.code === 'TOKEN_EXPIRED') {
                    setError('expired');
                    return;
                }
                throw new Error(data.message || 'Failed to reset password');
            }

            setIsSuccess(true);
            setTimeout(onSuccess, 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <motion.div {...pageTransition} className="text-center py-4">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-20 h-20 bg-[#00C9C8]/10 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                    <CheckCircle className="w-10 h-10 text-[#00C9C8]" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-2">Password Reset!</h2>
                <p className="text-[#94A3B8]">
                    Your password has been reset successfully. Redirecting to login...
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div {...pageTransition}>
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
                <p className="text-[#94A3B8] text-sm">
                    Create a new password for your account.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* New Password */}
                <div>
                    <label className="block text-sm font-medium text-[#F1F5F9] mb-2">
                        New Password
                    </label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full bg-[#0F172A] border border-[#334155] rounded-lg pl-4 pr-12 py-3 text-white placeholder-[#64748B] focus:outline-none focus:border-[#00C9C8] focus:ring-1 focus:ring-[#00C9C8] transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8] transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Strength Bar */}
                    {password.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3 space-y-2"
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-[#334155] rounded-full overflow-hidden">
                                    <motion.div
                                        className={`h-full ${strengthColor} rounded-full`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(score / 5) * 100}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <span className={`text-xs font-medium ${score <= 2 ? 'text-red-400' :
                                    score <= 3 ? 'text-amber-400' :
                                        score <= 4 ? 'text-blue-400' : 'text-[#00C9C8]'
                                    }`}>
                                    {strengthLabel}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Requirements Checklist */}
                <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="space-y-2"
                >
                    {[
                        { key: 'minLength', label: 'At least 8 characters' },
                        { key: 'hasUppercase', label: 'One uppercase letter' },
                        { key: 'hasLowercase', label: 'One lowercase letter' },
                        { key: 'hasNumber', label: 'One number' },
                        { key: 'hasSpecial', label: 'One special character (!@#$...)' },
                    ].map((req) => {
                        const met = requirements[req.key as keyof PasswordRequirements];
                        return (
                            <motion.div
                                key={req.key}
                                variants={staggerItem}
                                className="flex items-center gap-2 text-sm"
                            >
                                {met ? (
                                    <Check className="w-4 h-4 text-[#00C9C8]" />
                                ) : (
                                    <X className="w-4 h-4 text-[#475569]" />
                                )}
                                <span className={met ? 'text-[#00C9C8]' : 'text-[#64748B]'}>
                                    {req.label}
                                </span>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-sm font-medium text-[#F1F5F9] mb-2">
                        Confirm Password
                    </label>
                    <div className="relative">
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className={`w-full bg-[#0F172A] border rounded-lg pl-4 pr-12 py-3 text-white placeholder-[#64748B] focus:outline-none focus:ring-1 transition-all ${confirmPassword && !passwordsMatch
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                : 'border-[#334155] focus:border-[#00C9C8] focus:ring-[#00C9C8]'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8] transition-colors"
                        >
                            {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    {confirmPassword && !passwordsMatch && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-red-400 mt-1.5"
                        >
                            Passwords do not match
                        </motion.p>
                    )}
                </div>

                {/* Error Display */}
                {error === 'expired' ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center"
                    >
                        <Timer className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                        <h3 className="text-amber-400 font-semibold mb-1">Link Expired</h3>
                        <p className="text-amber-400/80 text-sm mb-3">
                            This password reset link has expired or is invalid.
                        </p>
                        <button
                            onClick={onSuccess}
                            className="text-sm text-[#00C9C8] hover:underline"
                        >
                            Request a new link
                        </button>
                    </motion.div>
                ) : error ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2"
                    >
                        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400">{error}</p>
                    </motion.div>
                ) : null}

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full bg-[#00C9C8] hover:bg-[#00C9C8]/90 disabled:bg-[#334155] disabled:text-[#64748B] text-[#1A1040] font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Resetting...
                        </>
                    ) : (
                        'Reset Password'
                    )}
                </button>
            </form>
        </motion.div>
    );
}

// ─── Expired State ───
function ExpiredStep({ onBack }: { onBack: () => void }) {
    return (
        <motion.div {...pageTransition} className="text-center py-4">
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6"
            >
                <Timer className="w-10 h-10 text-amber-500" />
            </motion.div>

            <h2 className="text-2xl font-bold text-white mb-2">Link Expired</h2>
            <p className="text-[#94A3B8] mb-8">
                This password reset link is invalid or has expired. Please request a new one.
            </p>

            <button
                onClick={onBack}
                className="w-full bg-[#00C9C8] hover:bg-[#00C9C8]/90 text-[#1A1040] font-semibold py-3 rounded-lg transition-all"
            >
                Request New Link
            </button>
        </motion.div>
    );
}