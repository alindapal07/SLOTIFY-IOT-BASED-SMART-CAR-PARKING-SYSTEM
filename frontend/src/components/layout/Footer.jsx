import React from 'react';

const Footer = () => {
  return (
    <footer className="w-full bg-white dark:bg-parking-dark border-t border-asphalt-200 dark:border-asphalt-800/80 py-6 mt-12 text-center text-xs text-asphalt-500 dark:text-asphalt-400">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>&copy; {new Date().getFullYear()} AIParkAI. All rights reserved.</p>
        <div className="flex gap-6 font-bold uppercase tracking-wider text-[10px] text-asphalt-450">
          <a href="#" className="hover:text-parking-primary transition">Privacy Policy</a>
          <a href="#" className="hover:text-parking-primary transition">Terms of Service</a>
          <a href="#" className="hover:text-parking-primary transition">Support Link</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
