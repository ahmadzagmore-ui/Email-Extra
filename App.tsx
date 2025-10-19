import React, { useState, useCallback, useRef } from 'react';
import { findBusinessEmailsStream } from './services/geminiService';
import type { Email } from './types';
import SearchForm from './components/SearchForm';
import ProgressStats from './components/ProgressStats';
import EmailList from './components/EmailList';
import ActionButtons from './components/ActionButtons';
import SearchStatus from './components/SearchStatus';
import GroundingSources from './components/GroundingSources';
import { Sparkles, AlertCircle } from './components/icons';

const TARGET_COUNT = 700;

export default function App() {
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchPhase, setSearchPhase] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const continuousSearchActive = useRef(false);

  const startSearch = useCallback(async (isContinuous: boolean) => {
    if (isSearching) return;

    abortControllerRef.current = new AbortController();
    setIsSearching(true);
    setError(null);
    setSearchPhase("");
    setGroundingSources([]);

    if (isContinuous) {
      continuousSearchActive.current = true;
    }

    do {
      let foundAnyEmailInBatch = false;
      
      const onNewEmailFound = (newEmail: Omit<Email, 'id'>) => {
          foundAnyEmailInBatch = true;
          const newEmailWithId = {
              ...newEmail,
              id: `${newEmail.email}-${Date.now()}-${Math.random()}`
          };
          setEmails(prevEmails => [...prevEmails, newEmailWithId]);
      };

      const onGroundingChunksFound = (chunks: any[]) => {
          const uniqueNewSources = chunks
              .filter(c => c.web && c.web.uri);

          if (uniqueNewSources.length > 0) {
              setGroundingSources(prevSources => {
                  const combined = [...prevSources, ...uniqueNewSources];
                  return Array.from(new Map(
                      combined.map(item => [item.web.uri, item])
                  ).values());
              });
          }
      };
      
      try {
        const searchedEmailsSet = new Set(emails.map(e => e.email.toLowerCase()));
        const result = await findBusinessEmailsStream(
            city, 
            service, 
            searchedEmailsSet,
            abortControllerRef.current.signal, 
            setSearchPhase,
            onNewEmailFound,
            onGroundingChunksFound
        );
        
        if (result.finalError) {
          setError(result.finalError);
          continuousSearchActive.current = false; // Stop on error
        } else if (!foundAnyEmailInBatch && !result.wasCancelled && !isContinuous) {
          setError("البحث العميق انتهى ولم يتم العثور على نتائج جديدة. قد يكون قد تم استخراج جميع الإيميلات المتاحة لهذه الكلمات المفتاحية.");
        }

        if (result.wasCancelled) {
            continuousSearchActive.current = false;
        }

      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
           setError("حدث خطأ فني أثناء البحث الديناميكي. يرجى المحاولة مرة أخرى.");
           console.error("Dynamic Search error:", err);
        }
        continuousSearchActive.current = false; // Stop on error
      }

      if (continuousSearchActive.current) {
        setSearchPhase("اكتملت الجولة. الاستعداد للجولة التالية...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (abortControllerRef.current?.signal.aborted) {
            continuousSearchActive.current = false;
        }
      }

    } while (continuousSearchActive.current);

    setIsSearching(false);
    setSearchPhase("");
    abortControllerRef.current = null;
  }, [city, service, emails, isSearching]);


  const handleStopSearch = () => {
    continuousSearchActive.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };
  
  const handleRegularSearch = () => startSearch(false);
  const handleContinuousSearch = () => startSearch(true);

  const handleCopy = () => {
    const emailList = emails.map(e => e.email).join('\n');
    navigator.clipboard.writeText(emailList);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleClear = () => {
    if (window.confirm('هل أنت متأكد من حذف جميع النتائج؟')) {
      setEmails([]);
      setGroundingSources([]);
    }
  };

  return (
    <div className="min-h-screen bg-black" dir="rtl">
      <div className="bg-gradient-to-b from-red-950 to-black border-b border-red-900">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="w-12 h-12 text-red-500 animate-pulse" />
              <h1 className="text-5xl font-black text-white">
                محرك البحث عن الإيميلات
              </h1>
            </div>
            <p className="text-xl text-gray-400">
              اكتشف عناوين البريد الإلكتروني التجارية بسهولة وسرعة
            </p>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-2xl p-8 shadow-2xl shadow-red-900/20">
          <SearchForm
            onSearch={handleRegularSearch}
            onContinuousSearch={handleContinuousSearch}
            isSearching={isSearching}
            city={city}
            service={service}
            setCity={setCity}
            setService={setService}
            onStop={handleStopSearch}
          />
        </div>

        <SearchStatus isSearching={isSearching} searchPhase={searchPhase} />

        {error && (
          <div role="alert" className="relative flex w-full items-center rounded-lg border border-red-800 bg-red-950 p-4 text-white">
            <AlertCircle className="h-5 w-5 mr-3" />
            <p className="text-lg">{error}</p>
          </div>
        )}
        
        {groundingSources.length > 0 && !isSearching && (
            <GroundingSources sources={groundingSources} />
        )}

        {emails.length > 0 && (
          <ProgressStats currentCount={emails.length} targetCount={TARGET_COUNT} />
        )}

        {emails.length > 0 && (
          <ActionButtons
            onCopy={handleCopy}
            onClear={handleClear}
            copied={copied}
            isClearing={false} 
          />
        )}

        {emails.length > 0 && (
          <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold text-white">النتائج</h2>
              <span className="text-gray-400 text-lg">
                {emails.length} إيميل
              </span>
            </div>
            <EmailList emails={emails} />
          </div>
        )}

        {emails.length === 0 && !isSearching && !error && (
          <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-2xl p-16 text-center">
            <Sparkles className="w-20 h-20 text-red-500 mx-auto mb-6 opacity-50" />
            <h3 className="text-2xl font-bold text-white mb-3">
              ابدأ البحث الآن
            </h3>
            <p className="text-gray-400 text-lg">
              أدخل المدينة ونوع الخدمة لبدء البحث عن الإيميلات
            </p>
          </div>
        )}

        <footer className="text-center py-8 border-t border-red-900">
          <p className="text-gray-500 text-lg">
            تصميم وتطوير بواسطة Gemini
          </p>
        </footer>
      </main>
    </div>
  );
}