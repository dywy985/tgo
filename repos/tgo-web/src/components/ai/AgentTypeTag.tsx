import React from 'react';

interface TypeConfig {
  label: string;
  bgColor: string;
  textColor: string;
}

interface AgentTypeTagProps {
  type: string;
  typeConfig: Record<string, TypeConfig>;
  className?: string;
}

/**
 * Agent type tag component
 */
const AgentTypeTag: React.FC<AgentTypeTagProps> = ({ type, typeConfig, className = '' }) => {
  const config = typeConfig[type];
  
  if (!config) {
    return null;
  }

  return (
    <span 
      className={`
        inline-block px-2 py-0.5 rounded text-xs font-medium
        ${config.bgColor} ${config.textColor}
        ${className}
      `}
    >
      {config.label}
    </span>
  );
};

export default AgentTypeTag;
