/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Coordinates, 
  CalculationMethod, 
  PrayerTimes, 
  Prayer,
  Qibla
} from 'adhan';
import { format, subDays } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { 
  Moon, 
  Sun, 
  Compass, 
  MessageCircle, 
  Bell, 
  BellOff, 
  Navigation,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  CheckCircle2,
  BookOpen,
  Heart,
  Plus,
  Settings,
  History,
  Languages,
  Trash2,
  Vibrate,
  Home,
  Check,
  TrendingUp,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { getGeminiResponse } from './services/geminiService';
import { TRANSLATIONS, ADHKAR_DATA } from './constants';

// --- Types ---
interface Location {
  latitude: number;
  longitude: number;
  city?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface PrayerRecord {
  date: string; // YYYY-MM-DD
  prayers: Record<string, { done: boolean; note: string }>;
}

interface CustomDua {
  id: string;
  text: string;
  isFavorite: boolean;
  count: number;
}

type Tab = 'home' | 'qibla' | 'tracker' | 'adhkar' | 'settings';

// --- Components ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "حدث خطأ ما. يرجى المحاولة مرة أخرى.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `خطأ في قاعدة البيانات: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-stone-100">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2 font-amiri">عذراً، حدث خطأ</h2>
            <p className="text-stone-500 mb-6 font-messiri">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-colors font-messiri"
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Logo = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="100%" stopColor="#fbbf24" />
      </radialGradient>
    </defs>
    
    {/* Rounded Square Background with Gradient */}
    <rect x="0" y="0" width="100" height="100" rx="20" fill="url(#bgGradient)" />
    
    {/* Sun Background */}
    <circle cx="50" cy="45" r="25" fill="url(#sunGlow)" />
    
    {/* Sun Rays */}
    <g stroke="#fef3c7" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
      {[...Array(16)].map((_, i) => (
        <line 
          key={i}
          x1="50" y1="45" 
          x2={50 + 48 * Math.cos((i * 22.5 * Math.PI) / 180)} 
          y2={45 + 48 * Math.sin((i * 22.5 * Math.PI) / 180)} 
        />
      ))}
    </g>

    {/* Mosque Silhouette (Navy Blue) */}
    <g fill="#1e3a8a">
      {/* Main Body */}
      <path d="M25 80 L25 65 Q25 58 35 55 L65 55 Q75 58 75 65 L75 80 Z" />
      {/* Onion Dome */}
      <path d="M35 65 Q50 35 65 65 Q50 60 35 65 Z" />
      <path d="M50 35 L50 30" stroke="#1e3a8a" strokeWidth="2" />
      {/* Minaret on Right */}
      <rect x="70" y="40" width="8" height="40" rx="1" />
      <rect x="68" y="55" width="12" height="3" rx="1" /> {/* Balcony */}
      <path d="M70 40 Q74 30 78 40 Z" /> {/* Small Dome */}
      <path d="M74 30 L74 25" stroke="#1e3a8a" strokeWidth="1.5" />
    </g>
    
    {/* Crescent Base */}
    <path 
      d="M10 75 Q50 100 90 75 Q50 110 10 75" 
      fill="#1e3a8a" 
    />
  </svg>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    const saved = localStorage.getItem('lang');
    return (saved as 'ar' | 'en') || 'ar';
  });
  const t = TRANSLATIONS[lang];
  const locale = lang === 'ar' ? ar : enUS;

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [theme, setTheme] = useState<'emerald' | 'midnight' | 'sand'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'emerald' | 'midnight' | 'sand') || 'emerald';
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<Location | null>(null);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [nextPrayer, setNextPrayer] = useState<string | null>(null);
  const [currentPrayer, setCurrentPrayer] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [timeElapsed, setTimeElapsed] = useState<string>('');
  const [hijriDate, setHijriDate] = useState<string>('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('notificationsEnabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    const saved = localStorage.getItem('vibrationEnabled');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [qiblaDirection, setQiblaDirection] = useState<number>(0);
  const [compassHeading, setCompassHeading] = useState<number>(0);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracker State
  const [trackerData, setTrackerData] = useState<Record<string, PrayerRecord>>(() => {
    const saved = localStorage.getItem('prayerTracker');
    return saved ? JSON.parse(saved) : {};
  });

  // Adhkar State
  const [customDuas, setCustomDuas] = useState<CustomDua[]>(() => {
    const saved = localStorage.getItem('customDuas');
    return saved ? JSON.parse(saved) : [];
  });
  const [dhikrProgress, setDhikrProgress] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('dhikrProgress');
    return saved ? JSON.parse(saved) : {};
  });
  const [newDuaText, setNewDuaText] = useState('');

  useEffect(() => {
    localStorage.setItem('dhikrProgress', JSON.stringify(dhikrProgress));
  }, [dhikrProgress]);

  useEffect(() => {
    localStorage.setItem('prayerTracker', JSON.stringify(trackerData));
  }, [trackerData]);

  useEffect(() => {
    localStorage.setItem('customDuas', JSON.stringify(customDuas));
  }, [customDuas]);

  const incrementDhikr = (id: string, max: number) => {
    setDhikrProgress(prev => {
      const current = prev[id] || 0;
      if (current >= max) return { ...prev, [id]: 0 }; // Reset if reached max
      return { ...prev, [id]: current + 1 };
    });
    if (vibrationEnabled && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const incrementCustomDua = (id: string) => {
    setCustomDuas(prev => prev.map(dua => 
      dua.id === id ? { ...dua, count: (dua.count || 0) + 1 } : dua
    ));
    if (vibrationEnabled && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const resetCustomDua = (id: string) => {
    setCustomDuas(prev => prev.map(dua => 
      dua.id === id ? { ...dua, count: 0 } : dua
    ));
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const testNotification = () => {
    if (!("Notification" in window)) {
      alert(lang === 'ar' ? "متصفحك لا يدعم الإشعارات." : "Your browser does not support notifications.");
      return;
    }
    
    if (Notification.permission === "granted") {
      new Notification(t.appName, {
        body: lang === 'ar' ? "تم تفعيل الإشعارات بنجاح!" : "Notifications enabled successfully!",
        icon: "/logo.png"
      });
      setNotificationsEnabled(true);
    } else if (Notification.permission === "denied") {
      alert(lang === 'ar' ? "الإشعارات محظورة في إعدادات المتصفح. يرجى تفعيلها يدوياً." : "Notifications are blocked in browser settings. Please enable them manually.");
      setNotificationsEnabled(false);
    } else {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(t.appName, {
            body: lang === 'ar' ? "تم تفعيل الإشعارات بنجاح!" : "Notifications enabled successfully!",
            icon: "/logo.png"
          });
          setNotificationsEnabled(true);
        } else {
          setNotificationsEnabled(false);
        }
      });
    }
  };

  // --- Initialization ---
  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.body.className = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('notificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('vibrationEnabled', JSON.stringify(vibrationEnabled));
  }, [vibrationEnabled]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const date = new Date();
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
    setHijriDate(hijri);
  }, [lang]);

  useEffect(() => {
    if (prayerTimes) {
      const next = prayerTimes.nextPrayer();
      const current = prayerTimes.currentPrayer();
      setNextPrayer(next !== Prayer.None ? next.toLowerCase() : 'fajr');
      setCurrentPrayer(current !== Prayer.None ? current.toLowerCase() : 'isha');

      const updateTimers = () => {
        const now = new Date();
        
        // Next Prayer Countdown
        const nextTime = prayerTimes.timeForPrayer(next !== Prayer.None ? next : Prayer.Fajr);
        if (nextTime) {
          let diff = nextTime.getTime() - now.getTime();
          if (diff < 0) {
            // If next is Fajr and it's after Isha, add 24h
            diff += 24 * 60 * 60 * 1000;
          }
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }

        // Current Prayer Elapsed
        const currentTimeForPrayer = prayerTimes.timeForPrayer(current !== Prayer.None ? current : Prayer.Isha);
        if (currentTimeForPrayer) {
          let diff = now.getTime() - currentTimeForPrayer.getTime();
          if (diff < 0) {
            // If current is Isha and it's before Fajr, it's from yesterday
            diff += 24 * 60 * 60 * 1000;
          }
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeElapsed(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      };

      updateTimers();
      const timer = setInterval(updateTimers, 1000);
      return () => clearInterval(timer);
    }
  }, [prayerTimes, currentTime]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ latitude, longitude });
          calculatePrayers(latitude, longitude);
          calculateQibla(latitude, longitude);
        },
        (err) => {
          setError(lang === 'ar' ? "يرجى تفعيل الموقع الجغرافي للحصول على أوقات الصلاة الدقيقة." : "Please enable geolocation for accurate prayer times.");
          console.error(err);
        }
      );
    }

    if ("Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // @ts-ignore
      const heading = e.webkitCompassHeading || (360 - (e.alpha || 0));
      setCompassHeading(heading);
      
      // Vibration logic
      if (vibrationEnabled && activeTab === 'qibla') {
        const diff = Math.abs(heading - qiblaDirection);
        if (diff < 5 || diff > 355) {
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [lang, vibrationEnabled, activeTab, qiblaDirection]);

  useEffect(() => {
    localStorage.setItem('prayerTracker', JSON.stringify(trackerData));
  }, [trackerData]);

  useEffect(() => {
    localStorage.setItem('customDuas', JSON.stringify(customDuas));
  }, [customDuas]);

  // Schedule notifications
  useEffect(() => {
    if (prayerTimes && notificationsEnabled) {
      const next = prayerTimes.nextPrayer();
      if (next !== Prayer.None) {
        const nextTime = prayerTimes.timeForPrayer(next);
        if (nextTime) {
          const delay = nextTime.getTime() - Date.now();
          if (delay > 0) {
            if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = setTimeout(() => {
              new Notification(t.appName, {
                body: lang === 'ar' ? `حان الآن موعد صلاة ${t[next.toLowerCase() as keyof typeof t]}` : `It is now time for ${t[next.toLowerCase() as keyof typeof t]} prayer`,
                icon: "/logo.png"
              });
              if (location) calculatePrayers(location.latitude, location.longitude);
            }, delay);
          }
        }
      }
    }
  }, [prayerTimes, notificationsEnabled, location, lang, t]);

  const calculatePrayers = (lat: number, lng: number) => {
    const coords = new Coordinates(lat, lng);
    const params = CalculationMethod.UmmAlQura();
    const times = new PrayerTimes(coords, new Date(), params);
    setPrayerTimes(times);
    const next = times.nextPrayer();
    setNextPrayer(next === Prayer.None ? null : next.toLowerCase());
  };

  const calculateQibla = (lat: number, lng: number) => {
    const coords = new Coordinates(lat, lng);
    const direction = Qibla(coords);
    setQiblaDirection(direction);
  };

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userInput }];
    setChatMessages(newMessages);
    setUserInput('');
    setIsTyping(true);
    try {
      const history = newMessages.map(m => ({ role: m.role, parts: [{ text: m.content }] }));
      const response = await getGeminiResponse(userInput, history, lang);
      setChatMessages([...newMessages, { role: 'model', content: response }]);
    } catch (err) {
      setChatMessages([...newMessages, { role: 'model', content: lang === 'ar' ? "عذراً، حدث خطأ ما." : "Sorry, something went wrong." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const togglePrayer = (prayerKey: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setTrackerData(prev => {
      const day = prev[today] || { date: today, prayers: {} };
      const current = day.prayers[prayerKey] || { done: false, note: '' };
      return {
        ...prev,
        [today]: {
          ...day,
          prayers: {
            ...day.prayers,
            [prayerKey]: { ...current, done: !current.done }
          }
        }
      };
    });
  };

  const updatePrayerNote = (prayerKey: string, note: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setTrackerData(prev => {
      const day = prev[today] || { date: today, prayers: {} };
      const current = day.prayers[prayerKey] || { done: false, note: '' };
      return {
        ...prev,
        [today]: {
          ...day,
          prayers: {
            ...day.prayers,
            [prayerKey]: { ...current, note }
          }
        }
      };
    });
  };

  const addCustomDua = () => {
    if (!newDuaText.trim()) return;
    const newDua: CustomDua = {
      id: Date.now().toString(),
      text: newDuaText,
      isFavorite: false,
      count: 0
    };
    setCustomDuas([newDua, ...customDuas]);
    setNewDuaText('');
  };

  const deleteDua = (id: string) => {
    setCustomDuas(customDuas.filter(d => d.id !== id));
  };

  const toggleFavoriteDua = (id: string) => {
    setCustomDuas(customDuas.map(d => d.id === id ? { ...d, isFavorite: !d.isFavorite } : d));
  };

  const getConsistency = () => {
    const totalDays = Object.keys(trackerData).length || 1;
    let totalDone = 0;
    Object.values(trackerData).forEach(day => {
      Object.values(day.prayers).forEach(p => {
        if (p.done) totalDone++;
      });
    });
    return Math.round((totalDone / (totalDays * 5)) * 100);
  };

  const themeClasses = {
    emerald: "bg-emerald-600",
    midnight: "bg-slate-900",
    sand: "bg-amber-700"
  };

  const themeText = {
    emerald: "text-emerald-600",
    midnight: "text-slate-900",
    sand: "text-amber-700"
  };

  const themeBgLight = {
    emerald: "bg-emerald-50",
    midnight: "bg-slate-50",
    sand: "bg-amber-50"
  };

  return (
    <div className={cn(
      "min-h-screen flex flex-col items-center pb-24 relative overflow-hidden islamic-pattern transition-colors duration-500", 
      lang === 'ar' ? 'rtl' : 'ltr',
      theme === 'midnight' ? 'bg-slate-50' : theme === 'sand' ? 'bg-stone-50' : 'bg-stone-50'
    )}>
      {/* Header */}
      <header className="w-full max-w-2xl flex justify-between items-center p-6 bg-white/80 backdrop-blur-md sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden bg-white"
          >
            <Logo className="w-full h-full" />
          </motion.div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold text-[#1e3a8a] font-amiri">صلاتي</span>
              <span className="text-2xl font-bold text-[#fbbf24] font-amiri">نور</span>
            </div>
            <div className="flex flex-col font-messiri">
              <p className="text-stone-500 text-[10px]">{format(currentTime, 'EEEE, d MMMM', { locale })}</p>
              <p className={cn("text-[10px] font-bold", themeText[theme])}>{hijriDate}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsChatOpen(true)}
            className={cn("p-2 rounded-xl transition-colors", themeBgLight[theme], themeText[theme])}
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className="p-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl p-4 space-y-6 flex-1">
        {error && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-800 text-sm flex items-center gap-3">
            <MapPin className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {prayerTimes ? (
                <div className={cn("rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden", themeClasses[theme], "text-white")}>
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Clock className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-xs opacity-80 uppercase tracking-widest mb-1 font-amiri">{t.nextPrayer}</p>
                        <h2 className="text-5xl font-bold font-amiri">{t[nextPrayer as keyof typeof t] || nextPrayer}</h2>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] opacity-70 uppercase mb-1 font-amiri">{lang === 'ar' ? 'الوقت المتبقي' : 'Time Remaining'}</p>
                        <p className="text-2xl font-messiri font-bold">{timeRemaining}</p>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-end mb-8">
                      <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium font-amiri">{location?.city || (lang === 'ar' ? 'جاري تحديد الموقع...' : 'Locating...')}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] opacity-70 uppercase mb-1 font-amiri">{lang === 'ar' ? 'مضى من الصلاة الحالية' : 'Elapsed Time'}</p>
                        <p className="text-lg font-messiri opacity-90">{timeElapsed}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((key) => {
                        const time = prayerTimes[key as keyof PrayerTimes] as Date;
                        const isNext = nextPrayer === key;
                        return (
                          <div 
                            key={key}
                            className={cn(
                              "flex justify-between items-center p-4 rounded-2xl transition-all",
                              isNext ? "bg-white text-emerald-900 shadow-lg" : "bg-white/10 text-white"
                            )}
                          >
                            <span className="font-medium font-amiri">{t[key as keyof typeof t]}</span>
                            <span className="font-messiri text-sm opacity-90">{format(time, 'hh:mm a', { locale })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-64 bg-stone-100 animate-pulse rounded-[2.5rem]" />
              )}
              
              {/* Quick Tracker */}
              <div className="bg-white p-6 rounded-[2rem] shadow-md border border-stone-100">
                <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  {t.markAsDone}
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(p => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    const isDone = trackerData[today]?.prayers[p]?.done;
                    const note = trackerData[today]?.prayers[p]?.note || '';
                    return (
                      <div key={p} className="space-y-2">
                        <button 
                          onClick={() => togglePrayer(p)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-2xl transition-all border",
                            isDone ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-stone-100 text-stone-600"
                          )}
                        >
                          <span className="font-medium">{t[p as keyof typeof t]}</span>
                          <div className={cn(
                            "w-6 h-6 rounded-full border flex items-center justify-center",
                            isDone ? "bg-emerald-500 border-emerald-500" : "border-stone-200"
                          )}>
                            {isDone && <Check className="w-4 h-4 text-white" />}
                          </div>
                        </button>
                        {isDone && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="px-2"
                          >
                            <input 
                              type="text"
                              value={note}
                              onChange={(e) => updatePrayerNote(p, e.target.value)}
                              placeholder={lang === 'ar' ? "أضف ملاحظة أو شعور..." : "Add a note or reflection..."}
                              className="w-full bg-stone-50 border-b border-stone-200 py-2 px-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'qibla' && (
            <motion.div 
              key="qibla"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center space-y-8 py-10"
            >
              <div className="relative w-72 h-72 flex items-center justify-center">
                {/* Realistic Golden Frame (Beveled) */}
                <div className="absolute inset-0 rounded-full border-[14px] border-[#D4AF37] shadow-[0_20px_50px_rgba(0,0,0,0.4),inset_0_2px_15px_rgba(255,255,255,0.7),inset_0_-2px_15px_rgba(0,0,0,0.5)] bg-gradient-to-br from-[#FFD700] via-[#D4AF37] to-[#8B4513] z-10" />
                
                {/* Floral Ornaments on Frame */}
                <div className="absolute inset-0 z-20 pointer-events-none opacity-60">
                  <svg viewBox="0 0 200 200" className="w-full h-full">
                    {[...Array(36)].map((_, i) => (
                      <g key={i} transform={`rotate(${i * 10} 100 100)`}>
                        {/* Small floral/leaf motif */}
                        <path 
                          d="M100 2 L103 8 Q100 10 97 8 Z M100 5 Q104 7 102 11 Q100 9 98 11 Q96 7 100 5" 
                          fill="#5C4033" 
                          className="drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]"
                        />
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Inner Metallic Ring */}
                <div className="absolute inset-[10px] rounded-full border-[3px] border-[#B8860B]/50 z-20 shadow-inner bg-gradient-to-tr from-[#B8860B]/20 to-transparent" />
                
                {/* Compass Face (Dial) */}
                <div className="absolute inset-[14px] rounded-full bg-[#fdfbf7] shadow-[inset_0_5px_15px_rgba(0,0,0,0.1)] z-0 overflow-hidden">
                  {/* Tick Marks (More detailed) */}
                  <div className="absolute inset-0 opacity-30">
                    {[...Array(72)].map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "absolute top-0 left-1/2 -translate-x-1/2 origin-bottom h-1/2",
                          i % 18 === 0 ? "w-1 bg-stone-900" : i % 2 === 0 ? "w-0.5 bg-stone-700" : "w-[0.5px] bg-stone-400"
                        )}
                        style={{ 
                          height: i % 18 === 0 ? '16px' : i % 2 === 0 ? '10px' : '6px',
                          transform: `rotate(${i * 5}deg)` 
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Subtle Islamic Pattern in Background */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.05]">
                    <svg viewBox="0 0 100 100" className="w-3/4 h-3/4">
                      <path d="M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z" fill="currentColor" className="text-stone-900" />
                      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    </svg>
                  </div>
                </div>

                {/* Glass Reflection Overlay */}
                <div className="absolute inset-[14px] rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/20 z-40 pointer-events-none" />
                
                {/* Rotating Compass Heading */}
                <motion.div 
                   className="absolute inset-0 flex items-center justify-center z-30"
                   animate={{ 
                     rotate: -compassHeading,
                   }}
                   transition={{ 
                     rotate: { type: 'spring', stiffness: 45, damping: 12 }
                   }}
                >
                  {/* Cardinal Points - Styled */}
                  <div className="absolute inset-0 flex items-center justify-center font-amiri font-bold">
                    <span className="absolute top-12 text-stone-900 text-3xl drop-shadow-sm">ش</span>
                    <span className="absolute bottom-12 text-stone-400 text-2xl">ج</span>
                    <span className="absolute right-12 text-stone-400 text-2xl">ق</span>
                    <span className="absolute left-12 text-stone-400 text-2xl">غ</span>
                  </div>

                  {/* Qibla Indicator (Realistic 3D Red Needle) */}
                  <motion.div 
                    className="absolute inset-0 flex flex-col items-center"
                    animate={{ rotate: qiblaDirection }}
                  >
                    <div className="mt-4 flex flex-col items-center relative">
                      {/* 3D Needle Body - Sharper and more detailed */}
                      <div className="relative flex">
                        {/* Left half (darker) */}
                        <div className="w-0 h-0 border-l-[10px] border-l-transparent border-b-[80px] border-b-rose-800 drop-shadow-[-2px_2px_4px_rgba(0,0,0,0.4)]" />
                        {/* Right half (lighter) */}
                        <div className="w-0 h-0 border-r-[10px] border-r-transparent border-b-[80px] border-b-rose-500 drop-shadow-[2px_2px_4px_rgba(0,0,0,0.3)]" />
                      </div>
                      {/* Needle Base Detail - Metallic Pin */}
                      <div className="absolute bottom-0 w-8 h-2 bg-gradient-to-r from-stone-400 via-stone-100 to-stone-400 blur-[0.5px] rounded-full shadow-lg" />
                      {/* Needle Tail/Shadow */}
                      <div className="w-1.5 h-36 bg-gradient-to-b from-rose-600/20 to-transparent blur-[2px] -mt-1" />
                    </div>
                  </motion.div>
                </motion.div>

                {/* Kaaba Icon with Glow */}
                <motion.div 
                  className="absolute inset-[-80px] flex items-start justify-center pointer-events-none z-40"
                  animate={{ 
                    rotate: qiblaDirection - compassHeading,
                  }}
                  transition={{ 
                    rotate: { type: 'spring', stiffness: 45, damping: 12 }
                  }}
                >
                  <motion.div 
                    animate={{ 
                      scale: (Math.abs(compassHeading - qiblaDirection) < 5 || Math.abs(compassHeading - qiblaDirection) > 355) ? 1.5 : 1,
                      opacity: (Math.abs(compassHeading - qiblaDirection) < 5 || Math.abs(compassHeading - qiblaDirection) > 355) ? 1 : 0.4,
                      filter: (Math.abs(compassHeading - qiblaDirection) < 5 || Math.abs(compassHeading - qiblaDirection) > 355) ? 'drop-shadow(0 0 25px rgba(251, 191, 36, 0.9))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
                    }}
                    className="text-7xl transition-all duration-300"
                  >
                    🕋
                  </motion.div>
                </motion.div>

                {/* Center Cap (Metallic/Gold) */}
                <div className="w-14 h-14 bg-gradient-to-br from-stone-50 via-stone-200 to-stone-400 border-[3px] border-[#D4AF37] rounded-full z-50 shadow-xl flex items-center justify-center">
                  <div className="w-5 h-5 bg-gradient-to-br from-[#FFD700] to-[#B8860B] rounded-full shadow-inner border border-stone-400/30" />
                </div>
              </div>

              <div className="text-center space-y-3 px-6">
                <h2 className="text-4xl font-bold text-stone-800 font-amiri">{t.qibla}</h2>
                <p className="text-stone-500 text-lg leading-relaxed font-amiri">{t.qiblaGuide}</p>
                <div className="flex items-center justify-center gap-3 bg-emerald-100 text-emerald-700 px-6 py-3 rounded-2xl font-messiri text-2xl shadow-sm border border-emerald-200">
                  <Navigation className="w-6 h-6 animate-pulse" />
                  <span className="font-bold">{Math.round(qiblaDirection)}°</span>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'tracker' && (
            <motion.div 
              key="tracker"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <TrendingUp className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                  <h2 className="text-3xl font-bold mb-2">{t.prayerTracker}</h2>
                  <p className="opacity-80 mb-6">{lang === 'ar' ? "معدل التزامك خلال الأسبوع" : "Your consistency this week"}</p>
                  
                  <div className="flex items-end gap-3 h-24 mb-6">
                    {[...Array(7)].map((_, i) => {
                      const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
                      const dayData = trackerData[date];
                      const doneCount = dayData ? Object.values(dayData.prayers).filter(p => p.done).length : 0;
                      const height = (doneCount / 5) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                          <div className="w-full bg-white/10 rounded-t-lg relative h-full">
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${height}%` }}
                              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg"
                            />
                          </div>
                          <span className="text-[10px] opacity-70 uppercase font-bold">
                            {format(subDays(new Date(), 6 - i), 'EEE', { locale })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/10">
                    <div className="text-center">
                      <p className="text-2xl font-messiri font-bold">{getConsistency()}%</p>
                      <p className="text-[10px] opacity-70 uppercase font-bold font-amiri">{lang === 'ar' ? "الإجمالي" : "Overall"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-messiri font-bold">
                        {Object.values(trackerData).filter(day => Object.values(day.prayers).filter(p => p.done).length === 5).length}
                      </p>
                      <p className="text-[10px] opacity-70 uppercase font-bold font-amiri">{lang === 'ar' ? "أيام كاملة" : "Full Days"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-stone-800 px-2 flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  {lang === 'ar' ? "السجل الأخير" : "Recent History"}
                </h3>
                {Object.values(trackerData).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map(day => (
                  <div key={day.date} className="bg-white p-6 rounded-[2rem] shadow-sm border border-stone-100">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-stone-700">
                        {format(new Date(day.date), 'EEEE, d MMMM', { locale })}
                      </span>
                      <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full">
                        {Object.values(day.prayers).filter(p => p.done).length}/5
                      </span>
                    </div>
                    <div className="flex gap-2 mb-4">
                      {['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(p => (
                        <div 
                          key={p}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold",
                            day.prayers[p]?.done ? "bg-emerald-100 text-emerald-600" : "bg-stone-50 text-stone-300"
                          )}
                        >
                          {t[p as keyof typeof t].charAt(0)}
                        </div>
                      ))}
                    </div>
                    {Object.entries(day.prayers).some(([_, p]) => p.note) && (
                      <div className="space-y-2 pt-3 border-t border-stone-50">
                        {Object.entries(day.prayers).map(([key, p]) => p.note && (
                          <div key={key} className="text-xs text-stone-500 italic flex gap-2">
                            <span className="font-bold not-italic text-stone-400 shrink-0">{t[key as keyof typeof t]}:</span>
                            <span>"{p.note}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'adhkar' && (
            <motion.div 
              key="adhkar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {['morning', 'evening', 'custom'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setUserInput(cat)} // Reusing userInput for sub-tab
                    className={cn(
                      "px-6 py-3 rounded-2xl whitespace-nowrap font-bold transition-all",
                      (userInput === cat || (!userInput && cat === 'morning')) ? "bg-emerald-600 text-white shadow-md" : "bg-white text-stone-600 border border-stone-100"
                    )}
                  >
                    {cat === 'morning' ? t.morningAdhkar : cat === 'evening' ? t.eveningAdhkar : t.myDuas}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {(userInput === 'custom') ? (
                  <>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newDuaText}
                        onChange={(e) => setNewDuaText(e.target.value)}
                        placeholder={t.addDua}
                        className="flex-1 bg-white border border-stone-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <button onClick={addCustomDua} className="bg-emerald-600 text-white p-3 rounded-2xl">
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                    {customDuas.map(dua => (
                      <div 
                        key={dua.id} 
                        onClick={() => incrementCustomDua(dua.id)}
                        className="bg-white p-6 rounded-[2rem] shadow-sm border border-stone-100 flex flex-col gap-4 cursor-pointer active:scale-[0.98] transition-all"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <p className="font-amiri text-lg leading-relaxed flex-1">{dua.text}</p>
                          <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => toggleFavoriteDua(dua.id)} className={cn(dua.isFavorite ? "text-rose-500" : "text-stone-300")}>
                              <Heart className={cn("w-5 h-5", dua.isFavorite && "fill-current")} />
                            </button>
                            <button onClick={() => deleteDua(dua.id)} className="text-stone-300 hover:text-rose-500">
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <button onClick={() => resetCustomDua(dua.id)} className="text-stone-300 hover:text-emerald-500">
                              <History className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div className="bg-emerald-50 text-emerald-700 px-4 py-1 rounded-full text-sm font-bold font-messiri">
                            {dua.count || 0}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  (ADHKAR_DATA[(userInput as 'morning' | 'evening') || 'morning']).map(dhikr => (
                    <div 
                      key={dhikr.id} 
                      onClick={() => incrementDhikr(dhikr.id, dhikr.count)}
                      className="bg-white p-6 rounded-[2rem] shadow-sm border border-stone-100 space-y-4 cursor-pointer active:scale-[0.98] transition-all"
                    >
                      <p className="font-amiri text-xl leading-relaxed text-center">{dhikr.text}</p>
                      <div className="flex justify-center">
                        <div className="relative">
                          <svg className="w-16 h-16 transform -rotate-90">
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="transparent"
                              className="text-stone-100"
                            />
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="transparent"
                              strokeDasharray={2 * Math.PI * 28}
                              strokeDashoffset={2 * Math.PI * 28 * (1 - (dhikrProgress[dhikr.id] || 0) / dhikr.count)}
                              className="text-emerald-600 transition-all duration-300"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center font-bold text-emerald-600 font-messiri">
                            {dhikrProgress[dhikr.id] || 0}/{dhikr.count}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-stone-100 space-y-8"
            >
              <h2 className="text-2xl font-bold text-stone-800 font-amiri">{t.settings}</h2>
              
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Languages className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium font-amiri">{t.language}</span>
                  </div>
                  <div className="flex bg-stone-100 p-1 rounded-xl">
                    <button 
                      onClick={() => setLang('ar')}
                      className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all font-messiri", lang === 'ar' ? cn(themeClasses[theme], "text-white shadow-sm") : "text-stone-400")}
                    >
                      {t.arabic}
                    </button>
                    <button 
                      onClick={() => setLang('en')}
                      className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all font-messiri", lang === 'en' ? cn(themeClasses[theme], "text-white shadow-sm") : "text-stone-400")}
                    >
                      {t.english}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Sun className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium font-amiri">{lang === 'ar' ? 'التصميم' : 'Theme'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'emerald', label: lang === 'ar' ? 'زمردي' : 'Emerald', color: 'bg-emerald-600' },
                      { id: 'midnight', label: lang === 'ar' ? 'ليلي' : 'Midnight', color: 'bg-slate-900' },
                      { id: 'sand', label: lang === 'ar' ? 'رملي' : 'Sand', color: 'bg-amber-700' },
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => setTheme(item.id as any)}
                        className={cn(
                          "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                          theme === item.id ? "border-emerald-600 bg-emerald-50" : "border-stone-100 bg-white"
                        )}
                      >
                        <div className={cn("w-8 h-8 rounded-full shadow-sm", item.color)} />
                        <span className="text-[10px] font-bold font-messiri">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium font-amiri">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</span>
                  </div>
                  <button 
                    onClick={() => {
                      const newState = !notificationsEnabled;
                      if (newState) {
                        if (!("Notification" in window)) {
                          alert(lang === 'ar' ? "متصفحك لا يدعم الإشعارات." : "Your browser does not support notifications.");
                          return;
                        }
                        
                        Notification.requestPermission().then(permission => {
                          if (permission === "granted") {
                            setNotificationsEnabled(true);
                            new Notification(t.appName, {
                              body: lang === 'ar' ? "تم تفعيل الإشعارات بنجاح!" : "Notifications enabled successfully!",
                              icon: "/logo.png"
                            });
                          } else {
                            alert(lang === 'ar' ? "يرجى السماح بالإشعارات من إعدادات المتصفح." : "Please allow notifications in browser settings.");
                          }
                        });
                      } else {
                        setNotificationsEnabled(false);
                      }
                    }}
                    className={cn("w-12 h-6 rounded-full transition-all relative", notificationsEnabled ? "bg-emerald-600" : "bg-stone-200")}
                  >
                    <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", lang === 'ar' ? (notificationsEnabled ? "left-1" : "right-1") : (notificationsEnabled ? "right-1" : "left-1"))} />
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Vibrate className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium font-amiri">{t.vibrationEnabled}</span>
                  </div>
                  <button 
                    onClick={() => setVibrationEnabled(!vibrationEnabled)}
                    className={cn("w-12 h-6 rounded-full transition-all relative", vibrationEnabled ? "bg-emerald-600" : "bg-stone-200")}
                  >
                    <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", lang === 'ar' ? (vibrationEnabled ? "left-1" : "right-1") : (vibrationEnabled ? "right-1" : "left-1"))} />
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100 text-center">
                <p className="text-stone-400 text-xs font-messiri">صلاتي نور v2.0</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-stone-100 p-4 flex justify-around items-center z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {[
          { id: 'home', icon: Home, label: t.prayerTimes },
          { id: 'qibla', icon: Compass, label: t.qibla },
          { id: 'tracker', icon: History, label: t.tracker },
          { id: 'adhkar', icon: BookOpen, label: t.adhkar },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as Tab)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === item.id ? "text-emerald-600 scale-110" : "text-stone-400 hover:text-stone-600"
            )}
          >
            <item.icon className={cn("w-6 h-6", activeTab === item.id && "fill-emerald-600/10")} />
            <span className="text-[10px] font-bold font-messiri">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Chat Drawer (Same as before but updated) */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50" />
            <motion.div initial={{ x: lang === 'ar' ? '100%' : '-100%' }} animate={{ x: 0 }} exit={{ x: lang === 'ar' ? '100%' : '-100%' }} className={cn("fixed top-0 h-full w-full max-w-md bg-white z-[60] shadow-2xl flex flex-col font-amiri", lang === 'ar' ? 'right-0' : 'left-0')}>
              <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg leading-tight font-amiri">{lang === 'ar' ? 'مساعد الصلاة' : 'Prayer Assistant'}</h2>
                    <p className="text-[10px] opacity-70 uppercase tracking-wider font-messiri">{lang === 'ar' ? 'مدعوم بـ جيميني' : 'Powered by Gemini'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setChatMessages([])}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                    title={lang === 'ar' ? "مسح المحادثة" : "Clear Chat"}
                  >
                    <Trash2 className="w-5 h-5 opacity-70 hover:opacity-100" />
                  </button>
                  <button 
                    onClick={() => setIsChatOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("max-w-[85%] p-4 rounded-2xl text-sm", msg.role === 'user' ? "bg-emerald-600 text-white mr-auto" : "bg-stone-100 text-stone-800 ml-auto")}>
                    <Markdown>{msg.content}</Markdown>
                  </div>
                ))}
                {isTyping && <Loader2 className="w-4 h-4 animate-spin text-stone-400 mx-auto" />}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 border-t flex gap-2">
                <input value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-stone-100 rounded-xl px-4 py-2 focus:outline-none" placeholder={lang === 'ar' ? 'اسأل شيئاً...' : 'Ask something...'} />
                <button onClick={handleSendMessage} className="bg-emerald-600 text-white p-2 rounded-xl"><Send className="w-5 h-5" /></button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
