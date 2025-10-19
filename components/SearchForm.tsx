import React from 'react';
import { Search, Loader2, StopCircle, RefreshCw } from './icons';

interface SearchFormProps {
  onSearch: () => void;
  onContinuousSearch: () => void;
  onStop: () => void;
  isSearching: boolean;
  city: string;
  service: string;
  setCity: (city: string) => void;
  setService: (service: string) => void;
}

export default function SearchForm({ onSearch, onContinuousSearch, onStop, isSearching, city, service, setCity, setService }: SearchFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (city.trim() && service.trim() && !isSearching) {
      onSearch();
    }
  };

  const handleContinuousClick = () => {
    if (city.trim() && service.trim() && !isSearching) {
        onContinuousSearch();
    }
  };

  const commonButtonClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xl font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 w-full h-16";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="city" className="text-white text-lg font-medium">
            المدينة
          </label>
          <input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="مثال: الرياض، دبي، القاهرة"
            className="flex h-14 w-full rounded-md border border-red-600 bg-gray-900 px-3 py-2 text-lg text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSearching}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="service" className="text-white text-lg font-medium">
            نوع الخدمة
          </label>
          <input
            id="service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="مثال: مطاعم، محامون، أطباء"
            className="flex h-14 w-full rounded-md border border-red-600 bg-gray-900 px-3 py-2 text-lg text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSearching}
            required
          />
        </div>
      </div>
      
      {isSearching ? (
         <button
            type="button"
            onClick={onStop}
            className={`${commonButtonClasses} bg-gradient-to-r from-gray-700 to-gray-800 text-white hover:from-gray-600 hover:to-gray-700 shadow-lg shadow-gray-900/50`}
          >
            <StopCircle className="w-6 h-6 ml-3" />
            إيقاف البحث
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
                type="submit"
                disabled={!city.trim() || !service.trim()}
                className={`${commonButtonClasses} bg-gradient-to-r from-red-600 to-red-800 text-white hover:from-red-700 hover:to-red-900 shadow-lg shadow-red-900/50`}
                >
                <Search className="w-6 h-6 ml-3" />
                ابدأ البحث
            </button>
            <button
                type="button"
                onClick={handleContinuousClick}
                disabled={!city.trim() || !service.trim()}
                className={`${commonButtonClasses} bg-gradient-to-r from-green-600 to-green-800 text-white hover:from-green-700 hover:to-green-900 shadow-lg shadow-green-900/50`}
            >
                <RefreshCw className="w-6 h-6 ml-3" />
                البحث المستمر
            </button>
        </div>
      )}

    </form>
  );
}