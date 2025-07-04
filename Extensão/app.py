from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

@app.route('/api/rodar-robo', methods=['POST'])
def salvar_filtros():
    try:
        dados_filtros = request.get_json()
        if not dados_filtros:
            raise ValueError("Nenhum dado de filtro recebido")

        pasta_base = os.path.dirname(os.path.abspath(__file__))
        filtros_path = os.path.join(pasta_base, "filtros.json")

        with open(filtros_path, "w", encoding="utf-8") as f:
            json.dump(dados_filtros, f, ensure_ascii=False, indent=2)

        print("✅ filtros.json salvo com sucesso")
        return jsonify({"status": "sucesso"})
    except Exception as e:
        print(f"❌ Erro ao salvar filtros: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.route('/filtros.json', methods=['GET'])
def obter_filtros():
    try:
        pasta_base = os.path.dirname(os.path.abspath(__file__))
        return send_from_directory(pasta_base, "filtros.json")
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
