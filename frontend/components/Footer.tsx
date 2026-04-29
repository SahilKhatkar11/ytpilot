import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

function seededParticle(index: number) {
  const seed = Math.sin(index * 999 + 17) * 10000;
  return seed - Math.floor(seed);
}

function cssNumber(value: number) {
  return Number(value.toFixed(4));
}

const Footer = ({ isDarkMode }: { isDarkMode: boolean }) => {
  return (
    <motion.footer
      whileHover="hover"
      whileTap="hover"
      className={`relative mt-auto w-full overflow-hidden pt-6 pb-10 transition-all duration-500 ${
        isDarkMode ? "border-t border-blue-900/20 bg-[#0c142e]/85" : "border-t border-blue-100/50 bg-blue-50/80"
      } backdrop-blur-md`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(45)].map((_, i) => {
          const colors = isDarkMode
            ? ["bg-blue-400", "bg-purple-400", "bg-pink-400", "bg-yellow-400", "bg-cyan-400", "bg-emerald-400", "bg-orange-400"]
            : ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-yellow-500", "bg-cyan-500", "bg-emerald-500", "bg-orange-500"];
          const color = colors[i % colors.length];
          const size = cssNumber(seededParticle(i) * 8 + 3);
          const left = cssNumber(seededParticle(i + 100) * 100);
          const top = cssNumber(seededParticle(i + 200) * 100);
          const burstX = cssNumber((seededParticle(i + 300) - 0.5) * 1000);
          const burstY = cssNumber((seededParticle(i + 400) - 0.5) * 400);
          const duration = cssNumber(seededParticle(i + 500) * 1.5 + 0.5);
          const delay = cssNumber(seededParticle(i + 600) * 0.5);
          return (
            <motion.div
              key={i}
              suppressHydrationWarning
              variants={{
                hover: {
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                  x: [0, burstX],
                  y: [0, burstY],
                  transition: {
                    duration,
                    delay,
                    ease: "easeOut"
                  }
                }
              }}
              initial={{ opacity: 0 }}
              className={`absolute rounded-full blur-[1px] ${color}`}
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                boxShadow: isDarkMode ? "0 0 15px currentColor" : "0 0 10px currentColor"
              }}
            />
          );
        })}
      </div>
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 text-center sm:px-8">
        <motion.div variants={{ hover: { scale: 1.05, y: -5 } }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="flex flex-col items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 transition-all duration-500 md:gap-3 md:rounded-3xl md:px-8 md:py-4 ${
              isDarkMode
                ? "border-blue-500/30 bg-slate-900/80 shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                : "border-blue-200 bg-white/80 shadow-[0_0_30px_rgba(59,130,246,0.1)]"
            } backdrop-blur-md`}
          >
            <Sparkles className={`h-5 w-5 md:h-6 md:w-6 ${isDarkMode ? "text-blue-400" : "text-blue-500"}`} />
            <p className={`text-sm font-medium tracking-tight md:text-xl ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
              Developed by{" "}
              <a
                href="https://github.com/sahilkhatkar11"
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative inline-block font-black transition-all duration-300 ${
                  isDarkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"
                }`}
              >
                Sahil Khatkar
                <span
                  className={`absolute -bottom-1 left-0 h-1 w-0 rounded-full transition-all duration-500 group-hover:w-full ${
                    isDarkMode ? "bg-gradient-to-r from-blue-400 to-purple-400" : "bg-gradient-to-r from-blue-600 to-purple-600"
                  }`}
                />
              </a>
            </p>
            <Sparkles className={`h-5 w-5 md:h-6 md:w-6 ${isDarkMode ? "text-blue-400" : "text-blue-500"}`} />
          </div>
        </motion.div>
      </div>
    </motion.footer>
  );
};

export default Footer;
