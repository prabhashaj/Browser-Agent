import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, MessageSquarePlus, Moon, Sun, Trash2, Keyboard } from "lucide-react";
import { usePilotStore } from "@/store/pilotStore";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSettingsOpen: () => void;
}

export function CommandPalette({ open, onClose, onSettingsOpen }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const s = usePilotStore();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset search on open
  useEffect(() => { if (open) setSearch(""); }, [open]);

  const run = (fn: () => void) => { fn(); onClose(); };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cmd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-overlay"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Palette */}
          <motion.div
            key="cmd-palette"
            initial={{ y: -12, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            className="fixed left-1/2 top-[20vh] z-50 w-full max-w-md -translate-x-1/2"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <Command
              className="overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
              loop
            >
              <div className="flex items-center border-b border-border px-4">
                <Command.Input
                  id="command-search"
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Type a command…"
                  className="h-12 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  autoFocus
                />
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Esc
                </kbd>
              </div>

              <Command.List className="max-h-72 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                  No commands found.
                </Command.Empty>

                <Command.Group heading="Conversation" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide">
                  <CmdItem
                    id="cmd-new"
                    icon={<MessageSquarePlus className="size-4" />}
                    label="New conversation"
                    onSelect={() => run(() => { document.dispatchEvent(new CustomEvent("pilot:new-thread")); })}
                  />
                  <CmdItem
                    id="cmd-history"
                    icon={<Clock className="size-4" />}
                    label="Open history"
                    onSelect={() => run(() => { document.dispatchEvent(new Event("pilot:open-history")); })}
                  />
                  <CmdItem
                    id="cmd-clear"
                    icon={<Trash2 className="size-4" />}
                    label="Clear current conversation"
                    onSelect={() => run(() => { document.dispatchEvent(new Event("pilot:clear-thread")); })}
                  />
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-border" />

                <Command.Group heading="Appearance" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide">
                  <CmdItem
                    id="cmd-dark"
                    icon={<Moon className="size-4" />}
                    label="Switch to dark mode"
                    onSelect={() => run(() => s.setTheme("dark"))}
                  />
                  <CmdItem
                    id="cmd-light"
                    icon={<Sun className="size-4" />}
                    label="Switch to light mode"
                    onSelect={() => run(() => s.setTheme("light"))}
                  />
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-border" />

                <Command.Group heading="Settings" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide">
                  <CmdItem
                    id="cmd-settings"
                    icon={<Keyboard className="size-4" />}
                    label="Open settings & shortcuts"
                    onSelect={() => run(onSettingsOpen)}
                  />
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function CmdItem({
  id,
  icon,
  label,
  onSelect,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      id={id}
      value={label}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground aria-selected:bg-agent-soft aria-selected:text-foreground transition-colors"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </Command.Item>
  );
}
