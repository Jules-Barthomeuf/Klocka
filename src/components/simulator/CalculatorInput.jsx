import React, { useState } from "react";
import { Input } from "@/components/ui/input";

export default function CalculatorInput({ value, onChange, className, ...props }) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(false);

  const evaluateExpression = (expr) => {
    try {
      // Nettoyer l'expression
      const cleaned = expr.trim().replace(/\s+/g, '');
      
      // Valider que l'expression ne contient que des chiffres et opérateurs autorisés
      if (!/^[\d+\-*/().]+$/.test(cleaned)) {
        return null;
      }

      // Évaluer l'expression de manière sécurisée
      const result = Function(`'use strict'; return (${cleaned})`)();
      
      if (typeof result === 'number' && !isNaN(result)) {
        return result;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    const result = evaluateExpression(inputValue);
    
    if (result !== null) {
      onChange(result);
      setInputValue(result.toString());
      setError(false);
    } else {
      // Si l'expression est invalide, revenir à la valeur précédente
      setInputValue(value.toString());
      setError(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleChange = (e) => {
    setInputValue(e.target.value);
    setError(false);
  };

  // Synchroniser avec les changements externes
  React.useEffect(() => {
    if (!isEditing) {
      setInputValue(value.toString());
    }
  }, [value, isEditing]);

  return (
    <Input
      {...props}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      className={`${className} ${error ? 'border-red-500' : ''}`}
    />
  );
}