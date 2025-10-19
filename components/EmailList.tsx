
import React from 'react';
import type { Email } from '../types';
import { Mail, ExternalLink, Building2, MapPin } from './icons';

interface EmailListProps {
  emails: Email[];
}

const EmailListItem: React.FC<{ email: Email }> = ({ email }) => (
    <div className="bg-gray-900/50 border border-red-800/50 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center transition-all hover:bg-gray-800/50 hover:border-red-700">
        <div className="flex items-center gap-3 overflow-hidden col-span-1">
            <Mail className="w-5 h-5 text-red-500 flex-shrink-0" />
            <a href={`mailto:${email.email}`} className="text-white font-medium truncate hover:text-red-400 transition-colors" title={email.email}>
                {email.email}
            </a>
        </div>
        <div className="flex items-center gap-3 overflow-hidden col-span-1">
            <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-300 truncate" title={email.business_name}>{email.business_name}</span>
        </div>
        <div className="flex items-center justify-between gap-3 col-span-1">
            <div className="flex items-center gap-2 overflow-hidden">
                <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-300 truncate" title={`${email.service} in ${email.city}`}>{email.service}, {email.city}</span>
            </div>
            <a href={email.source} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-400 p-2 rounded-full hover:bg-red-900/50 transition-colors">
                <ExternalLink className="w-5 h-5" />
            </a>
        </div>
    </div>
);


export default function EmailList({ emails }: EmailListProps) {
  const reversedEmails = [...emails].reverse();
  return (
    <div className="space-y-3">
        {reversedEmails.map((email) => (
          <EmailListItem key={email.id} email={email} />
        ))}
    </div>
  );
}
