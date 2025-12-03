import React from 'react';
import { LeadStatus } from '../../types';

export const Badge: React.FC<{ status: string }> = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';

  switch (status) {
    case LeadStatus.NEW:
      colorClass = 'bg-blue-100 text-blue-800';
      break;
    case LeadStatus.QUALIFIED:
      colorClass = 'bg-purple-100 text-purple-800';
      break;
    case LeadStatus.WON:
      colorClass = 'bg-green-100 text-green-800';
      break;
    case LeadStatus.LOST:
      colorClass = 'bg-red-100 text-red-800';
      break;
    case LeadStatus.NEGOTIATION:
      colorClass = 'bg-yellow-100 text-yellow-800';
      break;
    case LeadStatus.CONTACTED:
      colorClass = 'bg-indigo-100 text-indigo-800';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
};
