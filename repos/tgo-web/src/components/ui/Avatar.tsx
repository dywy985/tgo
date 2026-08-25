import React from 'react';
import Icon from './Icon';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: AvatarSize;
  icon?: string;
  bgColor?: string;
  initials?: string;
  className?: string;
}

/**
 * Avatar component that can display an image, icon, or initials
 */
const Avatar: React.FC<AvatarProps> = ({ 
  src, 
  alt = '', 
  size = 'md', 
  icon, 
  bgColor = 'bg-gray-200', 
  initials,
  className = '' 
}) => {
  const sizeClasses: Record<AvatarSize, string> = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  const iconSizes: Record<AvatarSize, number> = {
    sm: 16,
    md: 20,
    lg: 24
  };

  const baseClasses = `${sizeClasses[size]} rounded-md flex items-center justify-center flex-shrink-0 object-cover ${className}`;

  // Image avatar
  if (src) {
    return (
      <img 
        src={src} 
        alt={alt} 
        className={`${baseClasses} ${bgColor}`}
      />
    );
  }

  // Icon avatar
  if (icon) {
    return (
      <div className={`${baseClasses} ${bgColor}`}>
        <Icon 
          name={icon} 
          size={iconSizes[size]} 
          className="text-white" 
        />
      </div>
    );
  }

  // Initials avatar
  if (initials) {
    return (
      <div className={`${baseClasses} ${bgColor} text-white font-bold`}>
        {initials}
      </div>
    );
  }

  // Fallback
  return (
    <div className={`${baseClasses} ${bgColor}`}>
      <Icon 
        name="User" 
        size={iconSizes[size]} 
        className="text-gray-400" 
      />
    </div>
  );
};

export default Avatar;
