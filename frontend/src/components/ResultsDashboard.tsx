import { useEffect, useState } from "react";
import type { components } from '../types/api';
import { ScatterChart, Scatter, XAxis, YAxis,
    Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';

type ResultsResponse = components["schemas"]["ResultsResponse"];
type ClusteringResult = components["schemas"]["ClusteringResult"];
type RegressionResult = components["schemas"]["RegressionResult"];
type AnomalyResult = components["schemas"]["AnomalyResult"];

const CLUSTER_COLORS = ["#8884d8", "#82ca9d", "#ff7f7f"];

function ClusteringChart({ result }: { result: ClusteringResult }) {
    const data = result.cluster_labels.map((label, i) => ({i, label}));
    return (
      <div>
        <h3>Clustering</h3>
        <ScatterChart width={400} height={300}>
          <CartesianGrid />
          <XAxis dataKey="i" name="Index" />
          <YAxis dataKey="label" name="Cluster" />
          <Tooltip />
          {[0, 1, 2].map(cluster => (
            <Scatter
              key={cluster}
              name={`Cluster ${cluster}`}
              data={data.filter(d => d.label === cluster)}
              fill={CLUSTER_COLORS[cluster]}
            />
          ))}
        </ScatterChart>
        <p>Silhouette score: {result.silhouette_score.toFixed(3)}</p>
      </div>
    );
}

function RegressionChart({ result }: { result: RegressionResult }) {
    const data = result.coefficients.map((coef, i) => ({ feature: i, coefficient: coef }));
    return (
      <div>
        <h3>Regression</h3>
        <LineChart width={400} height={300} data={data}>
          <CartesianGrid />
          <XAxis dataKey="feature" name="Feature index" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="coefficient" stroke="#8884d8" />
        </LineChart>
        <p>R² score: {result.r2_score.toFixed(3)}</p>
      </div>
    );
}

function AnomalyTable({ result }: { result: AnomalyResult }) {
    return (
        <div>
        <h3>Anomaly Detection</h3>
        <p>Contamination rate: {(result.contamination_rate * 100).toFixed(1)}%</p>
        <table>
            <thead><tr><th>Anomaly row index</th></tr></thead>
            <tbody>
            {result.anomaly_indices.map(idx => (
                <tr key={idx} style={{ backgroundColor: "#ffe0e0" }}>
                <td>{idx}</td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    );
}

export default function ResultsDashboard({ fileId }: { fileId: string }) {
    const [data, setData] = useState<ResultsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL}/results/${fileId}`)
            .then(r => r.json())
            .then(setData)
            .catch(err => setError(String(err)));
    }, [fileId]);

    if (error) return <p style={{ color: "red" }}>{error}</p>;
    if (!data) return <p>Loading results...</p>;

    return (
      <div>
        <h2>Results</h2>
        {Object.values(data.results).map((result, i) => {
          if (result.type === "clustering") return <ClusteringChart key={i} result={result} />;
          if (result.type === "regression") return <RegressionChart key={i} result={result} />;
          if (result.type === "anomaly") return <AnomalyTable key={i} result={result} />;
        })}
        {data.summary && (
          <div>
            <h3>Summary</h3>
            <p>{data.summary}</p>
          </div>
        )}
      </div>
    );
}