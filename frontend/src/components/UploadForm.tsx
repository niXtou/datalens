import { useState } from 'react';
import type { components } from '../types/api';
import AnalysisStream from './AnalysisStream';

type UploadResponse = components['schemas']['UploadResponse'];
type ColumnSchema = components['schemas']['ColumnSchema'];

export default function UploadForm() {
    const [result, setResult] = useState<UploadResponse | null>(null);

    async function handleSubmit(formData: FormData) {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        setResult(data);
    }

    return (
        <form action={handleSubmit}>
            <input type="file" name="file" accept='.csv' required/>
            <button type="submit">Upload</button>
            {result && (
                <>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.columns.map((col: ColumnSchema) => (
                            <tr key={col.name}>
                                <td>{col.name}</td>
                                <td>{col.column_type}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <AnalysisStream fileId={result.file_id} />
                </>
            )}
        </form>
    );
}