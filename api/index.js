import React, { useEffect, useState } from "react";
import { csv } from "d3-fetch";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTv9Nf_RdMQwHDRRk1L1PrL6LsBV1hfhjUsZ9MhIV1LPWLOAmmb8BwI-eIavV01nrJORaE0U5Tv4g_b/pub?gid=916788690&single=true&output=csv";
const geoUrl = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const colorMap = { GREEN: "#27ae60", BLUE: "#3498db", YELLOW: "#f1c40f", RED: "#e74c3c", GREY: "#dfe4ea" };

export default function BenowDashboard() {
  const [data, setData] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    csv(SHEET_URL).then((rows) => {
      if (rows && rows.length > 0) {
        // 모든 키와 값을 대문자로 통일하여 저장 (매칭 확률 100%)
        const cleaned = rows.map(row => {
          const newRow = {};
          Object.keys(row).forEach(key => {
            const newKey = key.trim().toUpperCase();
            newRow[newKey] = row[key] ? row[key].trim().toUpperCase() : "";
          });
          return newRow;
        });
        setData(cleaned);
      } else {
        setLoadError("시트에서 데이터를 읽어오지 못했습니다. CSV 주소를 확인해주세요.");
      }
    }).catch(err => setLoadError("데이터 로드 오류: " + err.message));
  }, []);

  const brands = ["All", ...new Set(data.map(d => d.BRAND).filter(Boolean))];
  const filteredData = selectedBrand === "All" ? data : data.filter(d => d.BRAND === selectedBrand);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "30px", fontFamily: "sans-serif" }}>
      <h1 style={{ textAlign: "center", color: "#1e293b", marginBottom: "30px" }}>비나우 글로벌 상표권 현황</h1>
      
      {/* 상단 필터 */}
      <div style={{ maxWidth: "1100px", margin: "0 auto 20px", display: "flex", justifyContent: "flex-end" }}>
        <select onChange={(e) => setSelectedBrand(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          {brands.map(b => <option key={b}>{b}</option>)}
        </select>
      </div>

      {/* 지도 영역 */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", background: "#fff", borderRadius: "20px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", position: "relative", overflow: "hidden" }}>
        <ComposableMap projectionConfig={{ scale: 145 }} style={{ width: "100%", height: "600px" }}>
          <ZoomableGroup maxZoom={3} minZoom={1}>
            <Geographies geography={geoUrl}>
              {({ geographies }) => geographies.map((geo) => {
                const mapISO = (geo.properties.ISO_A3 || geo.id || "").toUpperCase();
                const info = filteredData.find(d => d.CODE === mapISO);
                const fillColor = info ? (colorMap[info.STATUS] || colorMap.GREY) : colorMap.GREY;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => {
                      const name = geo.properties.ADMIN || geo.properties.name;
                      setSelectedInfo(info ? { ...info, name } : { name, empty: true });
                    }}
                    style={{
                      default: { fill: fillColor, outline: "none", stroke: "#fff", strokeWidth: 0.5 },
                      hover: { fill: "#94a3b8", cursor: "pointer", outline: "none" }
                    }}
                  />
                );
              })}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* 모달 정보창 */}
        {selectedInfo && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "320px", background: "#fff", padding: "25px", borderRadius: "20px", boxShadow: "0 20px 50px rgba(0,0,0,0.2)", zIndex: 100, border: "2px solid #38bdf8" }}>
            <button onClick={() => setSelectedInfo(null)} style={{ position: "absolute", top: "15px", right: "15px", border: "none", background: "none", cursor: "pointer", fontSize: "18px" }}>✕</button>
            <h3 style={{ margin: "0 0 15px", borderBottom: "2px solid #38bdf8", display: "inline-block" }}>{selectedInfo.name}</h3>
            {selectedInfo.empty ? <p>등록 정보 없음</p> : (
              <div style={{ fontSize: "14px", lineHeight: "1.8" }}>
                <div><strong>브랜드:</strong> {selectedInfo.BRAND}</div>
                <div><strong>상태:</strong> {selectedInfo.STATUS}</div>
                <div><strong>내용:</strong> {selectedInfo.DETAILS}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🛠️ [Plan B] 자가진단 테이블: 지도가 회색일 때 아래 표가 나오는지 확인하세요 */}
      <div style={{ maxWidth: "1100px", margin: "40px auto", padding: "20px", background: "#fff", borderRadius: "10px", border: "1px solid #ddd" }}>
        <h4 style={{ marginTop: 0 }}>📊 데이터 로드 진단 (상단 지도가 회색일 경우 확인용)</h4>
        {loadError && <p style={{ color: "red" }}>{loadError}</p>}
        <table style={{ width: "100%", fontSize: "12px", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>BRAND</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>CODE</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 5).map((row, i) => (
              <tr key={i}>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{row.BRAND}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{row.CODE}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{row.STATUS}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: "11px", color: "#666", marginTop: "10px" }}>* 위 표에 데이터가 보인다면 시트 연결은 성공한 것입니다. 지도가 회색이라면 CODE 값이 'KOR', 'USA' 등과 정확히 일치하는지 확인하세요.</p>
      </div>
    </div>
  );
}
