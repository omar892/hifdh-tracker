import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStudents, useCreateStudent, useUpdateStudent } from "@workspace/api-client-react";
import { Plus, Edit2, Archive, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SurahSelector } from "@/components/ui/surah-selector";

export default function ManageStudents() {
  const { data: students, isLoading } = useListStudents();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "", currentSurah: 114, currentAyah: 1, startDate: new Date().toISOString().split('T')[0], notes: "", active: true
  });

  const resetForm = () => {
    setFormData({ name: "", currentSurah: 114, currentAyah: 1, startDate: new Date().toISOString().split('T')[0], notes: "", active: true });
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEdit = (s: any) => {
    setFormData({
      name: s.name, currentSurah: s.currentSurah, currentAyah: s.currentAyah, startDate: s.startDate, notes: s.notes || "", active: s.active
    });
    setEditingId(s.id);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, data: formData });
    } else {
      await createMutation.mutateAsync({ data: formData });
    }
    queryClient.invalidateQueries({ queryKey: ['/api/students'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
    resetForm();
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
    await updateMutation.mutateAsync({ id, data: { active: !currentStatus } });
    queryClient.invalidateQueries({ queryKey: ['/api/students'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
  };

  return (
    <AppLayout title="Manage Students">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl">Student Roster</h1>
          <p className="text-muted-foreground mt-1">Manage active enrollments and starting positions.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsFormOpen(true); }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
        >
          <Plus className="w-5 h-5" /> Add Student
        </button>
      </div>

      {isFormOpen && (
        <div className="mb-8 bg-card p-6 md:p-8 rounded-3xl border border-border/50 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
          <h2 className="font-display font-bold text-2xl mb-6">{editingId ? 'Edit Student' : 'New Student Registration'}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Full Name</label>
                <input 
                  type="text" required value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))}
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Start Date</label>
                <input 
                  type="date" required value={formData.startDate} onChange={e => setFormData(p => ({...p, startDate: e.target.value}))}
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Current Surah (Position)</label>
                <SurahSelector 
                  value={formData.currentSurah} onChange={v => setFormData(p => ({...p, currentSurah: v || 1}))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Current Ayah</label>
                <input 
                  type="number" required min="1" value={formData.currentAyah} onChange={e => setFormData(p => ({...p, currentAyah: Number(e.target.value)}))}
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
            </div>
            
            <div className="flex gap-4 pt-4 border-t border-border/50">
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:-translate-y-0.5 transition-all">
                Save Student
              </button>
              <button type="button" onClick={resetForm} className="px-8 py-3 bg-secondary text-foreground rounded-xl font-bold hover:bg-secondary/80 transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/50">
                <th className="p-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Name</th>
                <th className="p-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Status</th>
                <th className="p-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider">Current Position</th>
                <th className="p-4 font-semibold text-muted-foreground uppercase text-xs tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {students?.map(s => (
                <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-4 font-bold text-foreground">{s.name}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${s.active ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground font-medium">Surah {s.currentSurah} : {s.currentAyah}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(s)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleStatus(s.id, s.active)} className={`p-2 rounded-lg transition-all ${s.active ? 'text-muted-foreground hover:text-warning-foreground hover:bg-warning/10' : 'text-muted-foreground hover:text-success hover:bg-success/10'}`} title={s.active ? "Deactivate" : "Activate"}>
                        {s.active ? <Archive className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
