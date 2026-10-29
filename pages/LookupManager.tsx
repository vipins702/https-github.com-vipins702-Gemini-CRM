import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Plus, Trash2, Save, Database, List, Loader2, X, FileText, Code } from 'lucide-react';
import { api } from '../services/api';

interface LookupValue {
    id: string;
    lookup_id: string;
    value_id: string;
    value: string;
    sort_order: number;
}

interface ImportSource {
    id: string;
    label: string;
    valueField: string;
    labelField: string;
    description: string;
}

interface LiveSourceConfig {
    source_type: string;
    source_entity?: string;
    value_field: string;
    label_field: string;
    sql_query?: string;
}

export const LookupManager: React.FC = () => {
    const [lookups, setLookups] = useState<string[]>([]);
    const [selectedLookup, setSelectedLookup] = useState<string | null>(null);
    const [values, setValues] = useState<LookupValue[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // New lookup creation
    const [isNewLookupModalOpen, setIsNewLookupModalOpen] = useState(false);
    const [newLookupId, setNewLookupId] = useState('');

    // New value form
    const [newValueId, setNewValueId] = useState('');
    const [newValueLabel, setNewValueLabel] = useState('');

    // Import from table/SQL modal
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importSources, setImportSources] = useState<ImportSource[]>([]);
    const [selectedSource, setSelectedSource] = useState<string>('');
    const [importMode, setImportMode] = useState<'source' | 'sql'>('source');
    const [sqlQuery, setSqlQuery] = useState('');
    const [valueColumn, setValueColumn] = useState('value_id');
    const [labelColumn, setLabelColumn] = useState('value');

    // Live source config
    const [liveSource, setLiveSource] = useState<LiveSourceConfig | null>(null);
    const [isLive, setIsLive] = useState(false);

    useEffect(() => {
        loadLookups();
    }, []);

    const loadLookups = async () => {
        setLoading(true);
        try {
            // Get lookups from database
            const existingLookups = await api.getLookups();

            // Also scan schemas for lookup-type fields to auto-detect them
            const schemas = await api.getSchemas();
            const schemaLookups: string[] = [];

            Object.values(schemas).forEach((schema: any) => {
                if (schema.fields) {
                    schema.fields.forEach((field: any) => {
                        if (field.type === 'lookup' || field.type === 'select') {
                            // Use field name as lookup ID
                            const lookupId = `${schema.id}_${field.name}`;
                            if (!schemaLookups.includes(lookupId) && !existingLookups.includes(lookupId)) {
                                schemaLookups.push(lookupId);
                            }
                        }
                    });
                }
            });

            // Merge existing lookups with schema-detected lookups
            const allLookups = [...new Set([...existingLookups, ...schemaLookups])];
            setLookups(allLookups);

            if (allLookups.length > 0 && !selectedLookup) {
                setSelectedLookup(allLookups[0]);
            }
        } catch (error) {
            console.error('Failed to load lookups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedLookup) {
            loadValues(selectedLookup);
        }
    }, [selectedLookup]);

    const loadValues = async (lookupId: string) => {
        setLoading(true);
        try {
            // Check for live source config
            const sourceConfig = await api.getLiveSource(lookupId);
            setLiveSource(sourceConfig);
            setIsLive(!!sourceConfig);

            // Load values (backend returns live or static based on config)
            const data = await api.getLookupValues(lookupId);
            setValues(data);
        } catch (error) {
            console.error('Failed to load lookup values:', error);
            setValues([]);
            setLiveSource(null);
            setIsLive(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAddValue = async () => {
        if (!selectedLookup || !newValueId.trim() || !newValueLabel.trim()) return;

        setSaving(true);
        try {
            await api.saveLookupValue(selectedLookup, newValueId.trim(), newValueLabel.trim(), values.length);
            setNewValueId('');
            setNewValueLabel('');
            await loadValues(selectedLookup);
        } catch (error) {
            alert('Failed to add value');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveLiveConfig = async () => {
        if (!selectedLookup || !liveSource) return;
        setSaving(true);
        try {
            await api.setLiveSource(
                selectedLookup,
                liveSource.source_type,
                liveSource.source_entity,
                liveSource.value_field,
                liveSource.label_field,
                liveSource.sql_query
            );
            await loadValues(selectedLookup);
            alert('Live source configuration saved');
        } catch (error) {
            alert('Failed to save live source configuration');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveLiveConfig = async () => {
        handleRemoveLiveSource();
    }

    const handleRemoveLiveSource = async () => {
        if (!selectedLookup) return;
        if (!confirm('Are you sure? This will convert the lookup back to static values.')) return;
        setSaving(true);
        try {
            await api.removeLiveSource(selectedLookup);
            setLiveSource(null);
            setIsLive(false);
            await loadValues(selectedLookup);
        } catch (error) {
            alert('Failed to remove live source');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteValue = async (valueId: string) => {
        if (!selectedLookup) return;
        if (!confirm('Are you sure you want to delete this value?')) return;

        try {
            await api.deleteLookupValue(selectedLookup, valueId);
            await loadValues(selectedLookup);
        } catch (error) {
            alert('Failed to delete value');
        }
    };

    const handleCreateNewLookup = async () => {
        if (!newLookupId.trim()) return;

        // Create a lookup by adding an initial value
        setSaving(true);
        try {
            const lookupId = newLookupId.toLowerCase().replace(/\s+/g, '_');
            await api.saveLookupValue(lookupId, 'default', 'Default Value', 0);
            setNewLookupId('');
            setIsNewLookupModalOpen(false);
            await loadLookups();
            setSelectedLookup(lookupId);
        } catch (error) {
            alert('Failed to create lookup');
        } finally {
            setSaving(false);
        }
    };

    const openImportModal = async () => {
        setIsImportModalOpen(true);
        try {
            const sources = await api.getImportSources();
            setImportSources(sources);
            if (sources.length > 0) {
                setSelectedSource(sources[0].id);
            }
        } catch (error) {
            console.error('Failed to load import sources:', error);
        }
    };

    const handleImport = async () => {
        if (!selectedLookup) return;
        setSaving(true);
        try {
            let result;
            if (importMode === 'source') {
                if (!selectedSource) {
                    alert('Please select a source');
                    return;
                }
                result = await api.importFromSource(selectedLookup, selectedSource);
            } else {
                if (!sqlQuery.trim()) {
                    alert('Please enter a SQL query');
                    return;
                }
                result = await api.importFromSQL(selectedLookup, sqlQuery, valueColumn, labelColumn);
            }

            if (result.success) {
                alert(`Successfully imported ${result.count} values`);
                setIsImportModalOpen(false);
                setSqlQuery('');
                await loadValues(selectedLookup);
            } else {
                alert(result.message || 'Import failed');
            }
        } catch (error: any) {
            alert(error.message || 'Failed to import');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <div className="h-16 bg-surface border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Database className="w-6 h-6 text-indigo-600" />
                    <h1 className="text-lg font-bold text-gray-900">Lookup Manager</h1>
                </div>
                <Button icon={<Plus className="w-4 h-4" />} onClick={() => setIsNewLookupModalOpen(true)}>
                    New Lookup
                </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Lookup List */}
                <div className="w-72 bg-surface border-r border-gray-200 flex flex-col">
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="text-xs font-bold text-gray-500">Lookups by Object</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {lookups.length === 0 && !loading && (
                            <div className="text-center text-gray-400 text-sm py-8">
                                No lookups yet.<br />Create one to get started.
                            </div>
                        )}
                        {/* Group lookups by entity */}
                        {(() => {
                            const grouped: Record<string, string[]> = {};
                            lookups.forEach(lookupId => {
                                const parts = lookupId.split('_');
                                const entity = parts[0] || 'other';
                                if (!grouped[entity]) grouped[entity] = [];
                                grouped[entity].push(lookupId);
                            });

                            return Object.entries(grouped).map(([entity, entityLookups]) => (
                                <div key={entity} className="mb-3">
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-500 bg-gray-50 rounded-lg mb-1">
                                        <Database className="w-3 h-3" />
                                        {entity}
                                        <span className="ml-auto text-gray-400 font-normal">{entityLookups.length}</span>
                                    </div>
                                    {entityLookups.map(lookupId => {
                                        const fieldName = lookupId.split('_').slice(1).join('_') || lookupId;
                                        return (
                                            <button
                                                key={lookupId}
                                                onClick={() => setSelectedLookup(lookupId)}
                                                className={`w-full text-left px-4 py-2 rounded-lg mb-0.5 flex items-center gap-3 transition-all text-sm ${selectedLookup === lookupId
                                                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                                                    : 'hover:bg-gray-50 text-gray-600'
                                                    }`}
                                            >
                                                <List className="w-3 h-3" />
                                                <span className="truncate">{fieldName}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                {/* Right: Values Editor */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {!selectedLookup ? (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p>Select a lookup to manage its values</p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-2xl">
                            <div className="bg-surface rounded-xl shadow-sm border border-gray-200 p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-6">
                                    Lookup: <span className="text-indigo-600">{selectedLookup}</span>
                                </h2>

                                {/* Live Source Configuration */}
                                <div className="bg-indigo-50 rounded-lg p-4 mb-6 border border-indigo-100">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${isLive ? 'bg-indigo-600' : 'bg-gray-300'}`} onClick={() => setIsLive(!isLive)}>
                                                <div className={`w-3 h-3 bg-surface rounded-full shadow-sm transition-transform ${isLive ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                            <span className="text-sm font-bold text-gray-900">Dynamic Live Source</span>
                                        </div>
                                        {isLive && (
                                            <button onClick={handleRemoveLiveSource} className="text-xs text-red-600 hover:text-red-800 underline">
                                                Reset to Static
                                            </button>
                                        )}
                                    </div>

                                    {isLive && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Source Type</label>
                                                <select
                                                    className="w-full border border-indigo-200 rounded-md px-2 py-1.5 text-sm bg-surface"
                                                    value={liveSource?.source_type || 'users'}
                                                    onChange={(e) => setLiveSource({ ...liveSource, source_type: e.target.value } as any)}
                                                >
                                                    <option value="users">Users Table</option>
                                                    <option value="records">CRM Records</option>
                                                    <option value="sql">Custom SQL Query</option>
                                                </select>
                                            </div>

                                            {liveSource?.source_type === 'records' && (
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entity Type</label>
                                                    <select
                                                        className="w-full border border-indigo-200 rounded-md px-2 py-1.5 text-sm bg-surface"
                                                        value={liveSource?.source_entity || ''}
                                                        onChange={(e) => setLiveSource({ ...liveSource, source_entity: e.target.value } as any)}
                                                    >
                                                        <option value="">Select Entity...</option>
                                                        <option value="lead">Leads</option>
                                                        <option value="customer">Customers</option>
                                                        <option value="case">Cases</option>
                                                    </select>
                                                </div>
                                            )}

                                            {liveSource?.source_type === 'sql' && (
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">SQL Query</label>
                                                    <textarea
                                                        className="w-full border border-indigo-200 rounded-md px-2 py-1.5 text-sm font-mono h-24"
                                                        placeholder="SELECT id, name FROM custom_table WHERE tenant_id = :tenantId"
                                                        value={liveSource?.sql_query || ''}
                                                        onChange={(e) => setLiveSource({ ...liveSource, sql_query: e.target.value } as any)}
                                                    />
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Value Field</label>
                                                    <input
                                                        className="w-full border border-indigo-200 rounded-md px-2 py-1.5 text-sm"
                                                        placeholder="id"
                                                        value={liveSource?.value_field || 'id'}
                                                        onChange={(e) => setLiveSource({ ...liveSource, value_field: e.target.value } as any)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Label Field</label>
                                                    <input
                                                        className="w-full border border-indigo-200 rounded-md px-2 py-1.5 text-sm"
                                                        placeholder="name"
                                                        value={liveSource?.label_field || 'name'}
                                                        onChange={(e) => setLiveSource({ ...liveSource, label_field: e.target.value } as any)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-end pt-2">
                                                <Button size="sm" onClick={handleSaveLiveConfig} icon={<Save className="w-3 h-3" />}>Save Configuration</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Add New Value Form */}
                                {!isLive && (
                                    <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                                        <div className="flex justify-between items-center mb-3">
                                            <h3 className="text-sm font-medium text-gray-700">Add New Value</h3>
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    id="csvInput"
                                                    accept=".csv"
                                                    className="hidden"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file || !selectedLookup) return;

                                                        const text = await file.text();
                                                        const lines = text.split('\n').filter(l => l.trim());
                                                        const valuesToImport: any[] = [];

                                                        lines.forEach((line, i) => {
                                                            // Skip header if it looks like one (contains "value" or "id")
                                                            if (i === 0 && (line.toLowerCase().includes('value') || line.toLowerCase().includes('id'))) return;

                                                            const parts = line.split(',').map(s => s.trim());
                                                            let id = parts[0];
                                                            let val = parts[1];
                                                            let order = parts[2];

                                                            // Handle single column case (Just Value)
                                                            if (parts.length === 1 && id) {
                                                                val = id;
                                                                id = '';
                                                            }

                                                            if (val) {
                                                                valuesToImport.push({
                                                                    valueId: id || undefined,
                                                                    value: val,
                                                                    sortOrder: order ? parseInt(order) : 0
                                                                });
                                                            }
                                                        });

                                                        if (valuesToImport.length > 0) {
                                                            setLoading(true);
                                                            try {
                                                                await api.importLookupValues(selectedLookup, valuesToImport);
                                                                await loadValues(selectedLookup);
                                                                alert(`Successfully imported ${valuesToImport.length} values`);
                                                            } catch (err) {
                                                                alert('Failed to import values');
                                                            } finally {
                                                                setLoading(false);
                                                                // Reset file input
                                                                (document.getElementById('csvInput') as HTMLInputElement).value = '';
                                                            }
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => document.getElementById('csvInput')?.click()}
                                                    icon={<FileText className="w-3 h-3" />}
                                                >
                                                    Import CSV
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={openImportModal}
                                                    icon={<Database className="w-3 h-3" />}
                                                >
                                                    Import from Table
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                placeholder="Value ID (e.g. hot)"
                                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={newValueId}
                                                onChange={(e) => setNewValueId(e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Display Label (e.g. Hot Lead)"
                                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={newValueLabel}
                                                onChange={(e) => setNewValueLabel(e.target.value)}
                                            />
                                            <Button
                                                onClick={handleAddValue}
                                                disabled={saving || !newValueId.trim() || !newValueLabel.trim()}
                                                icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Values List */}
                                {loading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                    </div>
                                ) : values.length === 0 ? (
                                    <div className="text-center text-gray-400 py-8">
                                        No values in this lookup yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase px-3 py-2">
                                            <div className="col-span-4">Value ID</div>
                                            <div className="col-span-6">Display Label</div>
                                            <div className="col-span-2 text-right">Actions</div>
                                        </div>
                                        {values.map(v => (
                                            <div
                                                key={v.value_id}
                                                className="grid grid-cols-12 gap-2 items-center bg-surface border border-gray-200 rounded-lg px-3 py-3 hover:border-indigo-300 transition-colors"
                                            >
                                                <div className="col-span-4 text-sm font-mono text-gray-600">{v.value_id}</div>
                                                <div className="col-span-6 text-sm text-gray-900">{v.value}</div>
                                                <div className="col-span-2 text-right">
                                                    <button
                                                        onClick={() => handleDeleteValue(v.value_id)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* New Lookup Modal */}
            {isNewLookupModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-gray-900">Create New Lookup</h2>
                            <button onClick={() => setIsNewLookupModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Lookup ID</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="e.g. lead_source, priority_levels"
                                    value={newLookupId}
                                    onChange={(e) => setNewLookupId(e.target.value)}
                                />
                                <p className="text-xs text-gray-400 mt-1">This ID will be used to reference this lookup in field configurations.</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <Button variant="secondary" onClick={() => setIsNewLookupModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateNewLookup} disabled={!newLookupId.trim() || saving}>
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Lookup'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import from Table/SQL Modal */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-gray-900">Import Lookup Values</h2>
                            <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mode Tabs */}
                        <div className="flex gap-2 mb-6">
                            <button
                                onClick={() => setImportMode('source')}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${importMode === 'source' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                <Database className="w-4 h-4 inline mr-2" />
                                From Table
                            </button>
                            <button
                                onClick={() => setImportMode('sql')}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${importMode === 'sql' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                <Code className="w-4 h-4 inline mr-2" />
                                Custom SQL
                            </button>
                        </div>

                        {importMode === 'source' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Source</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        value={selectedSource}
                                        onChange={(e) => setSelectedSource(e.target.value)}
                                    >
                                        {importSources.map((source) => (
                                            <option key={source.id} value={source.id}>
                                                {source.label} - {source.description}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
                                    <strong>Note:</strong> Values will be imported with tenantId filter automatically applied.
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">SQL Query</label>
                                    <textarea
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        rows={4}
                                        placeholder="SELECT id as value_id, name as value FROM users WHERE tenant_id = :tenantId"
                                        value={sqlQuery}
                                        onChange={(e) => setSqlQuery(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Value ID Column</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                            value={valueColumn}
                                            onChange={(e) => setValueColumn(e.target.value)}
                                            placeholder="value_id"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Label Column</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                            value={labelColumn}
                                            onChange={(e) => setLabelColumn(e.target.value)}
                                            placeholder="value"
                                        />
                                    </div>
                                </div>
                                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-700">
                                    <strong>Hint:</strong> Use <code className="bg-amber-100 px-1 rounded">:tenantId</code> as a placeholder - it will be replaced with the current tenant ID.
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleImport} disabled={saving}>
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import Values'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
