import { useState } from "react";
import { FiDelete, FiRefreshCw } from "react-icons/fi";

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [operator, setOperator] = useState(null);
  const [replace, setReplace] = useState(false);

  const calculate = (left, right, operation) => {
    if (operation === "+") return left + right;
    if (operation === "−") return left - right;
    if (operation === "×") return left * right;
    if (operation === "÷") return right === 0 ? 0 : left / right;
    return right;
  };

  const digit = (value) => {
    if (value === "." && display.includes(".") && !replace) return;
    setDisplay(replace ? (value === "." ? "0." : value) : display === "0" && value !== "." ? value : display + value);
    setReplace(false);
  };
  const choose = (next) => {
    const value = Number(display);
    if (stored !== null && operator && !replace) {
      const result = calculate(stored, value, operator);
      setDisplay(String(Number(result.toFixed(8))));
      setStored(result);
    } else setStored(value);
    setOperator(next);
    setReplace(true);
  };
  const equals = () => {
    if (stored === null || !operator) return;
    const result = calculate(stored, Number(display), operator);
    setDisplay(String(Number(result.toFixed(8))));
    setStored(null);
    setOperator(null);
    setReplace(true);
  };
  const clear = () => { setDisplay("0"); setStored(null); setOperator(null); setReplace(false); };
  const backspace = () => setDisplay(display.length > 1 ? display.slice(0, -1) : "0");

  return <section className="calculator"><header><div><span>Quick tool</span><h3>Calculator</h3></div><button onClick={clear} title="Clear"><FiRefreshCw /></button></header><div className="calculator-display"><small>{stored !== null ? `${stored} ${operator || ""}` : "Ready"}</small><strong>{display}</strong></div><div className="calculator-keys"><button className="calc-clear" onClick={clear}>AC</button><button onClick={backspace}><FiDelete /></button><button className="calc-op" onClick={() => choose("÷")}>÷</button><button className="calc-op" onClick={() => choose("×")}>×</button>{["7","8","9"].map((key) => <button key={key} onClick={() => digit(key)}>{key}</button>)}<button className="calc-op" onClick={() => choose("−")}>−</button>{["4","5","6"].map((key) => <button key={key} onClick={() => digit(key)}>{key}</button>)}<button className="calc-op" onClick={() => choose("+")}>+</button>{["1","2","3"].map((key) => <button key={key} onClick={() => digit(key)}>{key}</button>)}<button className="calc-equals" onClick={equals}>=</button><button className="zero" onClick={() => digit("0")}>0</button><button onClick={() => digit(".")}>.</button></div></section>;
}
