'use client';

import { Search } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wrapperClassName?: string;
  iconClassName?: string;
};

export default function SearchAutocomplete({ value, onChange, placeholder, wrapperClassName, iconClassName }: Props) {
  return (
    <div className={wrapperClassName}>
      <Search size={16} className={iconClassName} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
