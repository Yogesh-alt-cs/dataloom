import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import mark from "@/assets/dataloom-mark.jpg";
import { Input } from "@/components/ui/input";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center paper-grain px-6">
      <div className="w-full max-w-md border border-foreground bg-card p-8">
        <Link to="/"><img src={mark} alt="DataLoom" className="h-12 w-12 mix-blend-multiply" /></Link>
        <h1 className="mt-6 font-display text-4xl">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function PasswordInput(props: { id: string; placeholder: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={props.id} type={show ? "text" : "password"} placeholder={props.placeholder} autoComplete={props.autoComplete}
        value={props.value} onChange={(e) => props.onChange(e.target.value)} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
