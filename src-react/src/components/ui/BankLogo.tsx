import { Building2 } from 'lucide-react';

interface BankLogoProps {
    bank: string;
    className?: string;
}

export function BankLogo({ bank, className = "w-9 h-9 text-xs" }: BankLogoProps) {
    const name = bank.toLowerCase();
    const normalizedName = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Default generic styles
    let bg = "bg-gray-50";
    let text = "text-gray-500";
    let border = "border-gray-200";
    let content: React.ReactNode = <Building2 className="w-[50%] h-[50%]" />;

    if (normalizedName.includes('banesco')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <defs>
                    <radialGradient id="banescoRedBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#ffb2b2" />
                        <stop offset="55%" stopColor="#ff1818" />
                        <stop offset="100%" stopColor="#6e0000" />
                    </radialGradient>
                    <radialGradient id="banescoBlueBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#b8c6ff" />
                        <stop offset="55%" stopColor="#1b2aa8" />
                        <stop offset="100%" stopColor="#05073d" />
                    </radialGradient>
                    <radialGradient id="banescoGreenBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#b5ffb5" />
                        <stop offset="55%" stopColor="#1f8b2d" />
                        <stop offset="100%" stopColor="#06280f" />
                    </radialGradient>
                    <radialGradient id="banescoRing" cx="70%" cy="80%">
                        <stop offset="0%" stopColor="#ffd4d4" />
                        <stop offset="55%" stopColor="#ff1212" />
                        <stop offset="100%" stopColor="#8f0000" />
                    </radialGradient>
                </defs>
                <ellipse cx="50" cy="78" rx="38" ry="12" fill="url(#banescoRing)" />
                <circle cx="50" cy="58" r="14" fill="url(#banescoRedBall)" />
                <path d="M59 42c7 0 13 6 13 13 0 4-2 8-5 10l-5-8c1-1 2-2 2-4 0-2-2-4-5-4z" fill="url(#banescoBlueBall)" />
                <circle cx="34" cy="28" r="10" fill="url(#banescoGreenBall)" />
            </svg>
        );
    } else if (normalizedName.includes('mercantil')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <path d="M12 70C55 70 74 52 86 28c-6 28-23 48-60 54z" fill="#F59B1A" />
                <path d="M14 28C56 30 75 46 86 70c-7-27-23-46-60-52z" fill="#0F68B2" />
            </svg>
        );
    } else if (normalizedName.includes('venezuela') || normalizedName.includes('bdv')) {
        bg = 'bg-white'; text = 'text-gray-700'; border = 'border-gray-200';
        content = (
            <svg viewBox="0 0 100 100" className="w-[80%] h-[80%]" aria-hidden="true">
                <polygon points="6,35 38,12 50,30 50,93" fill="#F9E600" stroke="#F5F5F5" strokeWidth="2.5" />
                <polygon points="50,30 92,6 92,78 50,93" fill="#F3272D" stroke="#F5F5F5" strokeWidth="2.5" />
                <polygon points="50,30 92,78 50,93" fill="#0E6FB6" stroke="#F5F5F5" strokeWidth="2.5" />
            </svg>
        );
    } else if (normalizedName.includes('bancaribe')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <polygon points="18,42 42,28 38,42" fill="#ffffff" />
                <polygon points="44,42 58,18 76,42" fill="#ffffff" />
                <polygon points="24,48 40,48 31,62" fill="#0B2D78" />
                <polygon points="42,48 76,48 46,84" fill="#0B2D78" />
            </svg>
        );
    } else if (normalizedName.includes('venezolano de credito')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <rect x="8" y="8" width="84" height="84" rx="12" fill="#0A5F69" />
                <path d="M22 26L34 52L50 20L64 20L50 52L62 76L78 44L66 44L62 52" fill="none" stroke="#E8EDF1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <path d="M22 26L34 52L22 76" fill="none" stroke="#E8EDF1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <path d="M64 20L78 44L66 68L78 44" fill="none" stroke="#E8EDF1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
        );
    } else if (normalizedName.includes('bangente')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <rect x="8" y="8" width="84" height="84" rx="2" fill="#4A1B6E" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="#D5DF53" strokeWidth="10" />
                <path d="M50 50L70 30" stroke="#D5DF53" strokeWidth="10" strokeLinecap="round" />
                <path d="M38 50L50 62L66 46" fill="none" stroke="#D5DF53" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    } else if (normalizedName.includes('100% banco') || normalizedName.includes('100 banco')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <circle cx="50" cy="50" r="42" fill="#2B0A46" stroke="#F05A4A" strokeWidth="3" />
                <path d="M50 8A42 42 0 0 1 92 50H50Z" fill="#4A1B6E" opacity="0.35" />
                <circle cx="50" cy="50" r="20" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity="0.92" />
                <text x="50" y="56" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="24" fill="#FFFFFF">100%</text>
            </svg>
        );
    } else if (normalizedName.includes('provincial') || normalizedName.includes('bbva')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <defs>
                    <linearGradient id="bbvaBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#0f4aa6" />
                        <stop offset="100%" stopColor="#1fa4d8" />
                    </linearGradient>
                </defs>
                <rect x="8" y="8" width="84" height="84" rx="18" fill="url(#bbvaBg)" />
                <path d="M52 12c16 2 28 14 30 30-8-8-20-16-34-18z" fill="#3ad8c8" fillOpacity="0.65" />
                <text x="50" y="58" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="22" fill="#ffffff">BBVA</text>
            </svg>
        );
    } else if (normalizedName.includes('bancamiga')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <circle cx="50" cy="50" r="34" fill="#0B4C9B" />
                <path d="M24 40c6-12 24-16 35-8-10 0-17 5-18 12-1 8 6 14 18 17-14 6-29-2-35-21z" fill="#6FB620" />
                <path d="M61 26c11 2 20 11 19 24-5-8-11-11-18-10-7 2-11 8-11 20-8-11-5-28 10-34z" fill="#6FB620" />
                <path d="M67 72c-10 7-23 6-32-3 9 2 15-1 19-7 4-6 3-14-5-23 14 3 23 18 18 33z" fill="#6FB620" />
                <circle cx="74" cy="29" r="2.5" fill="#ffffff" />
            </svg>
        );
    } else if (normalizedName.includes('bnc') || normalizedName.includes('nacional de credito')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <ellipse cx="54" cy="30" rx="35" ry="17" fill="#0d3e86" />
                <path d="M35 40l8-18M43 42l10-22M53 43l12-24M64 43l14-21" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                <text x="50" y="73" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="24" fill="#ef7d21">BNC</text>
            </svg>
        );
    } else if (normalizedName.includes('banplus')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <defs>
                    <linearGradient id="banplusGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#d6c28a" />
                        <stop offset="55%" stopColor="#b89c61" />
                        <stop offset="100%" stopColor="#e3d3a2" />
                    </linearGradient>
                    <clipPath id="banplusClip">
                        <circle cx="50" cy="50" r="40" />
                    </clipPath>
                </defs>
                <circle cx="50" cy="50" r="40" fill="url(#banplusGoldGrad)" />
                <g clipPath="url(#banplusClip)">
                    <path d="M15 34L72 22L90 30L25 42Z" fill="#0f2f6f" />
                    <path d="M12 50L76 38L94 46L22 58Z" fill="#0f2f6f" />
                    <path d="M18 66L82 54L98 62L28 74Z" fill="#0f2f6f" />
                </g>
            </svg>
        );
    } else if (normalizedName.includes('tesoro')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <path d="M8 52c0-10 8-18 18-18h30v18H8z" fill="#15A9E0" />
                <path d="M56 34h18c10 0 18 8 18 18v0H56V34z" fill="#F8C20C" />
                <path d="M38 52h24v12c0 8-6 14-14 14h-10V52z" fill="#FF2645" />
                <path d="M26 52h22v32c0 5-4 8-8 8h-6c-4 0-8-3-8-8V52z" fill="#15A9E0" />
            </svg>
        );
    } else if (normalizedName.includes('bicentenario')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <defs>
                    <radialGradient id="bicRedBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#ffb2b2" />
                        <stop offset="55%" stopColor="#ff1818" />
                        <stop offset="100%" stopColor="#6e0000" />
                    </radialGradient>
                    <radialGradient id="bicBlueBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#b8c6ff" />
                        <stop offset="55%" stopColor="#1b2aa8" />
                        <stop offset="100%" stopColor="#05073d" />
                    </radialGradient>
                    <radialGradient id="bicGreenBall" cx="60%" cy="35%">
                        <stop offset="0%" stopColor="#b5ffb5" />
                        <stop offset="55%" stopColor="#1f8b2d" />
                        <stop offset="100%" stopColor="#06280f" />
                    </radialGradient>
                    <radialGradient id="bicRing" cx="70%" cy="80%">
                        <stop offset="0%" stopColor="#ffd4d4" />
                        <stop offset="55%" stopColor="#ff1212" />
                        <stop offset="100%" stopColor="#8f0000" />
                    </radialGradient>
                </defs>
                <ellipse cx="50" cy="78" rx="38" ry="12" fill="url(#bicRing)" />
                <circle cx="50" cy="58" r="14" fill="url(#bicRedBall)" />
                <path d="M59 42c7 0 13 6 13 13 0 4-2 8-5 10l-5-8c1-1 2-2 2-4 0-2-2-4-5-4z" fill="url(#bicBlueBall)" />
                <circle cx="34" cy="28" r="10" fill="url(#bicGreenBall)" />
            </svg>
        );
    } else if (normalizedName.includes('digital de los trabajadores') || normalizedName.includes('bdt')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" aria-hidden="true">
                <path d="M12 70C55 70 74 52 86 28c-6 28-23 48-60 54z" fill="#F59B1A" />
                <path d="M14 28C56 30 75 46 86 70c-7-27-23-46-60-52z" fill="#0F68B2" />
            </svg>
        );
    } else if (normalizedName.includes('bfc') || normalizedName.includes('fondo comun')) {
        bg = 'bg-[#F59B1A]/12'; text = 'text-[#0F68B2]'; border = 'border-[#F59B1A]/30';
        content = <span className="font-black text-[0.7em] tracking-tight">BFC</span>;
    } else if (normalizedName.includes('exterior')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <defs>
                    <linearGradient id="exteriorBlueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#2058a8" />
                        <stop offset="100%" stopColor="#0b88d0" />
                    </linearGradient>
                </defs>
                <rect x="8" y="8" width="84" height="84" rx="10" fill="url(#exteriorBlueGrad)" />
                <path d="M22 24h56v8H22z" fill="#ffffff" />
                <path d="M22 34h22c8 0 14 6 14 14h-9c0-3-2-5-5-5H22z" fill="#ffffff" />
                <path d="M78 34H56c-8 0-14 6-14 14h9c0-3 2-5 5-5h22z" fill="#ffffff" />
                <path d="M22 50h22c3 0 5 2 5 5h9c0-8-6-14-14-14H22z" fill="#ffffff" />
                <path d="M78 50H56c-3 0-5 2-5 5h-9c0-8 6-14 14-14h22z" fill="#ffffff" />
                <text x="50" y="73" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="12" fill="#ffffff">EXTERIOR</text>
            </svg>
        );
    } else if (normalizedName.includes('r4') || normalizedName.includes('microfinanciero')) {
        bg = 'bg-transparent'; text = 'text-transparent'; border = 'border-transparent';
        content = (
            <svg viewBox="0 0 100 100" className="w-[92%] h-[92%]" aria-hidden="true">
                <rect x="8" y="8" width="84" height="84" rx="12" fill="#000000" />
                <path d="M23 26h16c8 0 12 4 12 10 0 4-2 7-7 9l8 11H42l-7-9h-5v9h-7zM30 32v9h8c4 0 6-2 6-4 0-3-2-5-6-5z" fill="#ffffff" />
                <path d="M69 56H51l18-30h9v24h7v6h-7v9h-9zM69 40l-10 16h10z" fill="#ffffff" />
                <rect x="54" y="57" width="31" height="4.2" rx="2" fill="#F05A28" />
            </svg>
        );
    }

    return (
        <div className={`flex items-center justify-center rounded-lg border flex-shrink-0 overflow-hidden ${bg} ${text} ${border} ${className}`}>
            {content}
        </div>
    );
}
