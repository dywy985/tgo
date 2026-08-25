import * as LucideIcons from 'lucide-react';
import type { IconProps } from '@/types';

/**
 * Icon component that renders Lucide icons
 */
const Icon: React.FC<IconProps> = ({ name, className = '', size = 20, ...props }) => {
  const IconComponent = LucideIcons[name as keyof typeof LucideIcons] as React.ComponentType<{
    size?: number;
    className?: string;
    [key: string]: any;
  }>;
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in Lucide icons`);
    return null;
  }

  return (
    <IconComponent 
      size={size} 
      className={className} 
      {...props} 
    />
  );
};

export default Icon;
