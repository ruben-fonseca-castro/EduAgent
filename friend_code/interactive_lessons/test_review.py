import asyncio
import json
import dotenv
from backend.agent.nodes import review_lesson

async def main():
    dotenv.load_dotenv(".env")
    state = {
        "lesson_plan": {
            "title": "Introduction to PID Controllers",
            "subject": "Control Engineering",
            "grade_level": "Undergraduate",
            "sections": [{}, {}]
        },
        "generated_sections": [
            {
                "title": "What is a PID Controller?",
                "generated_content": "<h2>What is a PID Controller?</h2>\n<p>A Proportional-Integral-Derivative controller is a control loop mechanism.</p>"
            }
        ],
        "iteration_count": 0
    }
    
    print("Testing review_lesson node...")
    try:
        res = await review_lesson(state)
        print("Review passed:", res["review_result"].passed)
        print("Issues:", res["review_result"].issues)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
