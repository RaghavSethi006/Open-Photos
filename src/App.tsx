import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhotoGrid } from "./components/PhotoGrid";
import { Timeline } from "./components/Timeline";
import { People } from "./components/People";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ThemeProvider } from "./contexts/ThemeContext";

const queryClient = new QueryClient();

function AppContent() {
  const [view, setView] = useState<"grid" | "timeline" | "people">("timeline");

  const handleScanComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["photos"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          view={view}
          onViewChange={setView}
          onScanComplete={handleScanComplete}
        />
        <main className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          {view === "timeline" ? (
            <Timeline />
          ) : view === "people" ? (
            <People />
          ) : (
            <PhotoGrid />
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
