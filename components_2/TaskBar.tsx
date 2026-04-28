"use client";

import { useRef, useState, useEffect } from "react";

export type AppTab = "endoscopy" | "gallery" | "video";

interface TaskBarProps {
    isAnimating: boolean;
    onToggleAnimation: () => void;
    activeTab: AppTab;
    onTabChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string }[] = [
    { id: "video", label: "Hazard Awareness" },
    { id: "endoscopy", label: "Editor" },
    { id: "gallery", label: "Dataset Preview" },
];

export default function TaskBar({ isAnimating, onToggleAnimation, activeTab, onTabChange }: TaskBarProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    return (
        <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
            {/* Left section: logo + tabs */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 font-semibold">
                    CARDIOVIS
                </div>
                <nav className="flex items-center gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? "bg-zinc-700 text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Right section: settings icon with dropdown */}
            <div className="relative flex items-center" ref={menuRef}>
                <button
                    onClick={() => setMenuOpen((v) => !v)}
                    title="Settings"
                    className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                        menuOpen ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    }`}
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066 1.724 1.724 0 012.372 2.372 1.724 1.724 0 001.066 2.573 1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.066 2.573 1.724 1.724 0 01-2.372 2.372 1.724 1.724 0 00-2.573 1.066 1.724 1.724 0 01-3.35 0 1.724 1.724 0 00-2.573-1.066 1.724 1.724 0 01-2.372-2.372 1.724 1.724 0 00-1.066-2.573 1.724 1.724 0 010-3.35 1.724 1.724 0 001.066-2.573 1.724 1.724 0 012.372-2.372 1.724 1.724 0 002.573-1.066z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {menuOpen && (
                    <div className="absolute right-0 top-10 z-50 min-w-40 rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
                        <button
                            onClick={() => { onToggleAnimation(); setMenuOpen(false); }}
                            className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
                                isAnimating
                                    ? "text-amber-400 hover:bg-zinc-800"
                                    : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                        >
                            {isAnimating ? "⏸" : "▶"}
                            {isAnimating ? "Pause" : "Play"}
                        </button>
                        <button
                            onClick={() => setMenuOpen(false)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                            <span className="text-red-400">●</span>
                            Capture
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
