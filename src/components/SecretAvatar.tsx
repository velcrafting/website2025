// src/components/SecretAvatar.tsx - Hidden admin access: click 5 times
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = { size?: number };

export default function SecretAvatar({ size = 72 }: Props) {
  const [clicks, setClicks] = useState(0);
  const router = useRouter();
  
  const handleClick = () => {
    const newCount = clicks + 1;
    setClicks(newCount);
    
    if (newCount >= 5) {
      setClicks(0);
      router.push("/admin/login");
    }
  };
  
  return (
    <Image 
      src="/avatar.png" 
      alt="Steven Pajewski" 
      width={size} 
      height={size} 
      className="rounded-full cursor-pointer select-none" style={{ width: "auto", height: "auto" }}
      onClick={handleClick}
      title={clicks > 0 ? `${5 - clicks} more clicks for admin` : "Click me"}
      priority={size >= 72}
    />
  );
}
