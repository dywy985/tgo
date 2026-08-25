import React from 'react';

interface StatusConfig {
  label: string;
  color: string;
}

interface StatusIndicatorProps {
  status: string;
  statusConfig: Record<string, StatusConfig>;
  className?: string;
}

/**
 * Status indicator component for agents and Tool tools
 */
const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, statusConfig, className = '' }) => {
  const config = statusConfig[status];
  
  if (!config) {
    return null;
  }

  return (
    <span 
      className={`w-2.5 h-2.5 ${config.color} rounded-full flex-shrink-0 ${className}`}
      title={config.label}
    />
  );
};

export default StatusIndicator;
