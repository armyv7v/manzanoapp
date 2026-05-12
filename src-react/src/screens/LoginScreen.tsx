import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks';
import { Button } from '../components/ui';
import { Apple, Mail, Lock, LogIn, Shield, UserPlus, Chrome } from 'lucide-react';

type AuthMode = 'login' | 'register';

function GoogleMark() {
    return <Chrome className="w-4 h-4" />;
}

export function LoginScreen() {
    const { signIn, register, signInWithGoogle, resetPassword, error, loading } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const isRegisterMode = mode === 'register';
    const visibleError = localError || error;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        setSuccessMessage(null);

        const normalizedEmail = email.trim().toLowerCase();

        if (isRegisterMode) {
            if (password.length < 6) {
                setLocalError('La contrasena debe tener al menos 6 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                setLocalError('Las contrasenas no coinciden.');
                return;
            }
        }

        try {
            if (isRegisterMode) {
                await register(normalizedEmail, password);
            } else {
                await signIn(normalizedEmail, password);
            }
        } catch {
            // handled in hook
        }
    };

    const handleGoogleAuth = async () => {
        setLocalError(null);
        setSuccessMessage(null);
        try {
            await signInWithGoogle();
        } catch {
            // handled in hook
        }
    };

    const handleResetPassword = async () => {
        setLocalError(null);
        setSuccessMessage(null);

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            setLocalError('Ingresa tu correo electronico para recuperar la contrasena.');
            return;
        }

        try {
            await resetPassword(normalizedEmail);
            setSuccessMessage('Te enviamos un correo para restablecer tu contrasena.');
        } catch (err: any) {
            setLocalError(err?.message || 'No se pudo enviar el correo de recuperacion.');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-manzano-400/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-manzano-400/5 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-manzano-400/3 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-sm relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-manzano-400 to-manzano-600 rounded-2xl shadow-lg shadow-manzano-400/20 mb-4">
                        <Apple className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Manzano App</h1>
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                        <Shield className="w-3 h-3 text-gray-500" />
                        <p className="text-xs text-gray-400">
                            {isRegisterMode ? 'Crea tu cuenta de usuario' : 'Ingresa con tu cuenta'}
                        </p>
                    </div>
                </div>

                <div className="bg-white/[0.07] backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-2xl space-y-5">
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1 border border-white/10">
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setLocalError(null); }}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${!isRegisterMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-300 hover:text-white'}`}
                        >
                            Iniciar sesion
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('register'); setLocalError(null); }}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${isRegisterMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-300 hover:text-white'}`}
                        >
                            Registrarse
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                <Mail className="w-3 h-3" />
                                Correo electronico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="usuario@correo.com"
                                required
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-manzano-400/50 focus:border-transparent transition-all text-sm"
                            />
                        </div>

                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                <Lock className="w-3 h-3" />
                                Contrasena
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Ingresa tu contrasena"
                                required
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-manzano-400/50 focus:border-transparent transition-all text-sm"
                            />
                            {!isRegisterMode && (
                                <div className="flex justify-end mt-2">
                                    <button
                                        type="button"
                                        onClick={handleResetPassword}
                                        disabled={loading}
                                        className="text-[11px] font-semibold text-manzano-300 hover:text-manzano-200 transition-colors disabled:opacity-50"
                                    >
                                        Recuperar contrasena
                                    </button>
                                </div>
                            )}
                        </div>

                        {isRegisterMode && (
                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                    <Lock className="w-3 h-3" />
                                    Confirmar contrasena
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Repite tu contrasena"
                                    required
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-manzano-400/50 focus:border-transparent transition-all text-sm"
                                />
                            </div>
                        )}

                        {visibleError && (
                            <div className="bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-300 text-xs flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 shrink-0" />
                                {visibleError}
                            </div>
                        )}
                        {successMessage && (
                            <div className="bg-emerald-500/15 border border-emerald-500/20 rounded-xl px-4 py-2.5 text-emerald-200 text-xs flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 shrink-0" />
                                {successMessage}
                            </div>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            isLoading={loading}
                            className="!bg-gradient-to-r !from-manzano-400 !to-manzano-600 hover:!from-manzano-500 hover:!to-manzano-700 !text-white !font-bold !py-3 !rounded-xl !shadow-lg !shadow-manzano-400/20"
                        >
                            <span className="flex items-center justify-center gap-2">
                                {isRegisterMode ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                                {isRegisterMode ? 'Crear cuenta' : 'Iniciar sesion'}
                            </span>
                        </Button>
                    </form>

                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">o</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        fullWidth
                        disabled={loading}
                        onClick={handleGoogleAuth}
                        className="!border-white/15 !bg-white/5 !text-white hover:!bg-white/10 !rounded-xl !py-3"
                        leftIcon={<GoogleMark />}
                    >
                        Continuar con Google
                    </Button>
                </div>

                <p className="text-center text-[11px] text-gray-600 mt-3">
                    Manzano App - {new Date().getFullYear()} - v2.0
                </p>
            </div>
        </div>
    );
}
