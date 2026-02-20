import asyncio
import dotenv
from backend.agent.nodes import generate_figures

async def main():
    dotenv.load_dotenv(".env")
    state = {
        "lesson_plan": {
            "subject": "Control Engineering",
            "grade_level": "Undergraduate",
            "figure_requests": [
                {
                    "type": "plotly",
                    "description": "Interactive Plotly figure for the response of the PID controller to setpoint changes in a simulated process.",
                    "section_index": 2
                }
            ]
        }
    }
    res = await generate_figures(state)
    print("FIGURES GENERATED:")
    import json
    for f in res.get("generated_figures", []):
        print(f"\n--- {f['figure_type']} ---")
        if f['figure_type'] == 'plotly':
            data = f['data']
            if isinstance(data, str):
                try: 
                    jd = json.loads(data)
                    print(f"Plotly JSON keys: {jd.keys()}")
                    if "error" in jd:
                        print(f"Error: {jd['error']}")
                except:
                    if len(data) > 300:
                        print(f"Plotly keys: {data[:300]}...")
                    else:
                        print(f"Plotly error string: {data}")
            else:
                 print(f"Plotly keys: {data.keys()}")
        else:
            print(f"Data:\n{f['data'][:500]}")

if __name__ == "__main__":
    asyncio.run(main())
