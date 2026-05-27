// src/core/ai/contextManager.ts
// Gerencia todos os contextos ativos do sistema
// Convertido de CommonJS para ESM TypeScript

export type ContextType = "usb" | "boardview" | "schematic" | "troubleshooting" | "pdf" | "userPrompt";

export interface USBContext {
  brand?: string;
  model?: string;
  androidVersion?: string;
  cpu?: string;
  serial?: string;
  batteryVoltage?: string;
  mode?: string;
  bootloaderStatus?: string;
  logs?: string[];
  updatedAt?: string;
}

export interface BoardviewContext {
  name?: string;
  category?: string;
  part_code?: string;
  description?: string;
  side?: string;
  x?: number;
  y?: number;
  electricalLine?: string;
  voltage?: string;
  commonFaults?: string[];
  updatedAt?: string;
}

export interface SchematicContext {
  net?: string;
  voltage?: string;
  powerRail?: string;
  pageIndex?: number;
  updatedAt?: string;
}

export interface TroubleshootingContext {
  symptom?: string;
  deviceModel?: string;
  updatedAt?: string;
}

export interface PDFContext {
  fileName?: string;
  pageIndex?: number;
  extractedText?: string;
  updatedAt?: string;
}

export interface ActiveContexts {
  usb?: USBContext;
  boardview?: BoardviewContext;
  schematic?: SchematicContext;
  troubleshooting?: TroubleshootingContext;
  pdf?: PDFContext;
  userPrompt?: { text: string; updatedAt?: string };
}

type ContextListener = (contexts: ActiveContexts) => void;

class ContextManager {
  private contexts: ActiveContexts = {
    usb: undefined,
    boardview: undefined,
    schematic: undefined,
    troubleshooting: undefined,
    pdf: undefined,
    userPrompt: undefined,
  };

  private listeners: ContextListener[] = [];

  setContext<K extends ContextType>(type: K, data: ActiveContexts[K] | null) {
    if (data) {
      this.contexts[type] = { ...data, updatedAt: new Date().toISOString() } as any;
    } else {
      this.contexts[type] = undefined;
    }
    this.notifyListeners();
  }

  getActiveContexts(): ActiveContexts {
    return Object.fromEntries(
      Object.entries(this.contexts).filter(([_, v]) => v !== undefined && v !== null)
    ) as ActiveContexts;
  }

  getActiveContextNames(): string[] {
    return Object.entries(this.contexts)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k]) => k);
  }

  clearContext(type: ContextType) {
    this.contexts[type] = undefined;
    this.notifyListeners();
  }

  clearAll() {
    (Object.keys(this.contexts) as ContextType[]).forEach(k => {
      this.contexts[k] = undefined;
    });
    this.notifyListeners();
  }

  subscribe(fn: ContextListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notifyListeners() {
    const active = this.getActiveContexts();
    this.listeners.forEach(fn => fn(active));
  }
}

// Singleton global
export const contextManager = new ContextManager();
export { ContextManager };
