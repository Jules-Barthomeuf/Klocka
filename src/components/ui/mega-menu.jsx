import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

export default function MegaMenu({ items, className }) {
  const [openMenu, setOpenMenu] = React.useState(null);
  const [isHover, setIsHover] = React.useState(null);

  const handleHover = (menuLabel) => {
    setOpenMenu(menuLabel);
  };

  return (
    <ul
      className={`relative flex flex-col space-y-1 ${className || ""}`}
    >
      {items.map((navItem) => (
        <li
          key={navItem.label}
          className="relative"
          onMouseEnter={() => handleHover(navItem.label)}
          onMouseLeave={() => handleHover(null)}
        >
          {navItem.link ? (
            <Link
              to={navItem.link}
              className="relative flex cursor-pointer items-center gap-3 px-3 py-2.5 rounded-full text-sm text-gray-300 transition-colors duration-300 hover:text-white group"
              onMouseEnter={() => setIsHover(navItem.id)}
              onMouseLeave={() => setIsHover(null)}
            >
              {navItem.icon && <navItem.icon className="w-4 h-4 flex-shrink-0" />}
              <span className="font-montserrat font-medium flex items-center gap-2">
                {navItem.label}
                {navItem.badge && (
                  <span className="bg-[#2A9D8F]/20 text-[#2A9D8F] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {navItem.badge}
                  </span>
                )}
              </span>
              {navItem.subMenus && (
                <ChevronDown
                  className={`h-4 w-4 ml-auto transition-transform duration-300 ${
                    openMenu === navItem.label ? "rotate-180" : ""
                  }`}
                />
              )}
              {(isHover === navItem.id || openMenu === navItem.label) && (
                <motion.div
                  layoutId="hover-bg"
                  className="absolute inset-0 size-full bg-white/10"
                  style={{
                    borderRadius: 99,
                  }}
                />
              )}
            </Link>
          ) : (
            <button
              className="relative flex cursor-pointer items-center w-full gap-3 px-3 py-2.5 rounded-full text-sm text-gray-300 transition-colors duration-300 hover:text-white group"
              onMouseEnter={() => setIsHover(navItem.id)}
              onMouseLeave={() => setIsHover(null)}
            >
              {navItem.icon && <navItem.icon className="w-4 h-4 flex-shrink-0" />}
              <span className="font-montserrat font-medium flex items-center gap-2">
                {navItem.label}
                {navItem.badge && (
                  <span className="bg-[#2A9D8F]/20 text-[#2A9D8F] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {navItem.badge}
                  </span>
                )}
              </span>
              {navItem.subMenus && (
                <ChevronDown
                  className={`h-4 w-4 ml-auto transition-transform duration-300 group-hover:rotate-180 ${
                    openMenu === navItem.label ? "rotate-180" : ""
                  }`}
                />
              )}
              {(isHover === navItem.id || openMenu === navItem.label) && (
                <motion.div
                  layoutId="hover-bg"
                  className="absolute inset-0 size-full bg-white/10"
                  style={{
                    borderRadius: 99,
                  }}
                />
              )}
            </button>
          )}

          <AnimatePresence>
            {openMenu === navItem.label && navItem.subMenus && (
              <div className="fixed left-64 top-0 w-auto pt-2 z-50">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="w-max border border-white/10 bg-[#0A0A0A] p-4 shadow-2xl"
                  style={{
                    borderRadius: 16,
                  }}
                >
                  <div className="flex w-fit shrink-0 space-x-9 overflow-hidden">
                    {navItem.subMenus.map((sub) => (
                      <motion.div layout className="w-full min-w-[200px]" key={sub.title}>
                        <h3 className="mb-4 text-sm font-medium capitalize text-white/50">
                          {sub.title}
                        </h3>
                        <ul className="space-y-4 max-h-[400px] overflow-y-auto">
                          {sub.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.label}>
                                <Link
                                  to={item.link}
                                  className="flex items-start space-x-3 group"
                                >
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/30 text-white transition-colors duration-300 group-hover:bg-white group-hover:text-[#0A0A0A]">
                                    <Icon className="h-5 w-5 flex-none" />
                                  </div>
                                  <div className="w-max leading-5">
                                    <p className="shrink-0 text-sm font-medium text-white">
                                      {item.label}
                                    </p>
                                    {item.description && (
                                      <p className="shrink-0 text-xs text-white/50 transition-colors duration-300 group-hover:text-white">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </li>
      ))}
    </ul>
  );
}