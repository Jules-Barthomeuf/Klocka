import React from 'react';

export default function SearchInput({ value, onChange, onKeyPress, placeholder = "Rechercher..." }) {
  return (
    <div className="relative flex items-center justify-center w-full md:w-auto">
      <div className="relative flex items-center justify-center group">
        {/* Couche de fond avec effet conic gradient */}
        <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[50px] max-w-full md:max-w-[314px] rounded-xl blur-[3px] 
                        before:absolute before:content-[''] before:z-[-2] before:w-[999px] before:h-[999px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-60
                        before:bg-[conic-gradient(#000,#2A9D8F_5%,#000_38%,#000_50%,#71CCBA_60%,#000_87%)] before:transition-all before:duration-2000
                        group-hover:before:rotate-[-120deg] group-focus-within:before:rotate-[420deg] group-focus-within:before:duration-[4000ms]">






        </div>
        
        <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[48px] max-w-full md:max-w-[312px] rounded-xl blur-[3px] 
                        before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[82deg]
                        before:bg-[conic-gradient(rgba(0,0,0,0),#1a5a52,rgba(0,0,0,0)_10%,rgba(0,0,0,0)_50%,#4a7b74,rgba(0,0,0,0)_60%)] before:transition-all before:duration-2000
                        group-hover:before:rotate-[-98deg] group-focus-within:before:rotate-[442deg] group-focus-within:before:duration-[4000ms]">






        </div>

        <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[46px] max-w-full md:max-w-[310px] rounded-lg blur-[2px] 
                        before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[83deg]
                        before:bg-[conic-gradient(rgba(0,0,0,0)_0%,#71CCBA,rgba(0,0,0,0)_8%,rgba(0,0,0,0)_50%,#2A9D8F,rgba(0,0,0,0)_58%)] before:brightness-140
                        before:transition-all before:duration-2000 group-hover:before:rotate-[-97deg] group-focus-within:before:rotate-[443deg] group-focus-within:before:duration-[4000ms]">






        </div>

        <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[44px] max-w-full md:max-w-[308px] rounded-xl blur-[0.5px] 
                        before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-70
                        before:bg-[conic-gradient(#0a0a0a,#2A9D8F_5%,#0a0a0a_14%,#0a0a0a_50%,#71CCBA_60%,#0a0a0a_64%)] before:brightness-130
                        before:transition-all before:duration-2000 group-hover:before:rotate-[-110deg] group-focus-within:before:rotate-[430deg] group-focus-within:before:duration-[4000ms]">






        </div>

        <div className="relative group">
          







          
          {/* Icône de recherche */}
          <div className="absolute left-4 top-[9px] pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" height="24" fill="none">
              <circle stroke="url(#search)" r="8" cy="11" cx="11"></circle>
              <line stroke="url(#searchl)" y2="16.65" y1="22" x2="16.65" x1="22"></line>
              <defs>
                <linearGradient gradientTransform="rotate(50)" id="search">
                  <stop stopColor="#71CCBA" offset="0%"></stop>
                  <stop stopColor="#2A9D8F" offset="50%"></stop>
                </linearGradient>
                <linearGradient id="searchl">
                  <stop stopColor="#2A9D8F" offset="0%"></stop>
                  <stop stopColor="#1a7a6f" offset="50%"></stop>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </div>);

}