'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type VerificationState = 'verifying' | 'success' | 'expired' | 'already_used' | 'invalid';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<VerificationState>('verifying');
  const [resending, setResending] = useState(false);
  const verifyAttempted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    const verifyEmail = async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}`);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.alreadyVerified) {
             setStatus('already_used');
          } else {
             setStatus('success');
             setTimeout(() => {
               router.push('/dashboard');
             }, 3000);
          }
        } else {
          const errorData = await res.json().catch(() => ({}));
          const errMsg = (errorData.message || '').toLowerCase();
          if (errMsg.includes('expired')) {
            setStatus('expired');
          } else if (errMsg.includes('already')) {
            setStatus('already_used');
          } else {
            setStatus('invalid');
          }
        }
      } catch (err) {
        setStatus('invalid');
      }
    };

    verifyEmail();
  }, [token, router]);

  const handleResend = async () => {
    if (!token || resending) return;
    setResending(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      // Assuming a success toast or alert would go here in a real app
    } catch (error) {
      console.error('Failed to resend verification:', error);
    } finally {
      setResending(false);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3, ease: 'easeIn' } },
  };

  const renderState = () => {
    switch (status) {
      case 'verifying':
        return (
          <motion.div
            key="verifying"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-brand-indigo/5 dark:bg-brand-indigo/20 flex items-center justify-center mb-2 shadow-inner border border-brand-indigo/10 dark:border-brand-indigo/30">
              <span className="font-sora font-black tracking-tighter text-3xl text-brand-indigo dark:text-brand-cyan">SV</span>
            </div>
            <Loader2 className="w-10 h-10 text-brand-cyan animate-spin" />
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-sora font-bold text-foreground">
                Verifying your email address...
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">
                Please wait a moment while we confirm your email.
              </p>
            </div>
          </motion.div>
        );
      case 'success':
        return (
          <motion.div
            key="success"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <div className="w-24 h-24 bg-brand-cyan/10 rounded-full flex items-center justify-center mb-2 border border-brand-cyan/20">
              <CheckCircle className="w-12 h-12 text-brand-cyan" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-sora font-bold text-foreground">
                Email verified successfully!
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto mb-6">
                Redirecting you to the dashboard...
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => router.push('/dashboard')}
              className="bg-brand-cyan text-brand-indigo font-semibold hover:bg-brand-cyan/90 w-full sm:w-auto text-base px-8 h-12"
            >
              Go to Dashboard
            </Button>
          </motion.div>
        );
      case 'expired':
        return (
          <motion.div
            key="expired"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <div className="w-24 h-24 bg-brand-amber/10 rounded-full flex items-center justify-center mb-2 border border-brand-amber/20">
              <Clock className="w-12 h-12 text-brand-amber" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-sora font-bold text-foreground">
                This link has expired.
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto mb-6">
                For your security, verification links expire after a certain time. Please request a new one.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleResend}
              disabled={resending}
              className="bg-brand-amber text-brand-indigo font-semibold hover:bg-brand-amber/90 w-full sm:w-auto text-base px-8 h-12"
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                'Resend Verification Email'
              )}
            </Button>
          </motion.div>
        );
      case 'already_used':
        return (
          <motion.div
            key="already_used"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2 border border-emerald-500/20">
              <CheckCircle className="w-12 h-12 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-sora font-bold text-foreground">
                Email already verified.
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto mb-6">
                Your email address has already been verified. You can proceed to your dashboard or sign in.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Button
                size="lg"
                onClick={() => router.push('/dashboard')}
                className="bg-brand-indigo text-white dark:bg-white dark:text-brand-indigo font-semibold hover:opacity-90 flex-1 sm:flex-none text-base px-8 h-12"
              >
                Go to Dashboard
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push('/login')}
                className="font-semibold flex-1 sm:flex-none text-base px-8 h-12"
              >
                Sign In
              </Button>
            </div>
          </motion.div>
        );
      case 'invalid':
      default:
        return (
          <motion.div
            key="invalid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center justify-center space-y-6 text-center"
          >
            <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mb-2 border border-destructive/20">
              <XCircle className="w-12 h-12 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-sora font-bold text-foreground">
                Invalid verification link.
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto mb-6">
                This link is invalid or malformed. Please request a new verification email.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleResend}
              disabled={resending}
              className="bg-brand-indigo text-white dark:bg-white dark:text-brand-indigo font-semibold hover:opacity-90 w-full sm:w-auto text-base px-8 h-12"
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                'Resend Verification Email'
              )}
            </Button>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-cyan/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-indigo/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-lg bg-card/80 backdrop-blur-xl border border-border/50 rounded-[2rem] shadow-2xl p-8 sm:p-12 overflow-hidden relative z-10">
        <AnimatePresence mode="wait">
          {renderState()}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center relative">
        <Loader2 className="w-12 h-12 text-brand-cyan animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
