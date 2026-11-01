작성: Codex

# AI 검색 설치·사용 방법

## 사용할 버전

가장 최신의 **검증된 앱 버전**과 그 버전에 지정된 모델·프롬프트 조합을 사용한다. APK가 여러 개면 버전이 높은 검증 APK를 고른다. 모델 이름의 숫자가 높다는 이유로 임의 교체하지 않는다. 이전 설치 안내보다 이 문서를 우선한다. 새 검증 결과를 배포하면 이 대표 안내도 함께 갱신한다.

현재 1차 조합은 Gemma 4 E2B Q4_0 + 저장소 `src/nlp/intentModel.json`의 V4 프로토콜이다. 아래 모델을 별도로 설치해야 하며 **APK만 설치하면 AI 검색은 사용할 수 없다.** 정식 릴리스가 있다고 가정하지 않는다. 릴리스가 아직 없으면 현재 검증 커밋의 소스와 개발 가이드의 빌드 방법을 사용한다.

## 모델 설치

- 공식 원본: https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/main/gemma-4-E2B_q4_0-it.gguf
- 파일명: `gemma-4-E2B_q4_0-it.gguf`
- 크기: 3,349,516,256 bytes
- SHA256: `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`
- 앱 경로: `/sdcard/Android/data/kr.ac.skuniv.campusclient/files/models/gemma-4-E2B_q4_0-it.gguf`

공식 링크에서 파일을 받아 위 이름으로 저장하고 SHA256을 확인한다. 충분한 저장 공간을 확보한다. 대용량 GGUF는 일반 Git에 추가하거나 APK에 내장하지 않는다.

PowerShell에서 실제 최신 검증 APK 경로를 넣고 실행한다. `-r`은 기존 앱 데이터 보존 업데이트다. 앱 삭제나 데이터 초기화 명령을 사용하지 않는다.

```powershell
Get-FileHash -Algorithm SHA256 .\gemma-4-E2B_q4_0-it.gguf
adb install -r "최신-검증-버전.apk"
adb shell mkdir -p /sdcard/Android/data/kr.ac.skuniv.campusclient/files/models
adb push .\gemma-4-E2B_q4_0-it.gguf /sdcard/Android/data/kr.ac.skuniv.campusclient/files/models/gemma-4-E2B_q4_0-it.gguf
adb shell ls -l /sdcard/Android/data/kr.ac.skuniv.campusclient/files/models/gemma-4-E2B_q4_0-it.gguf
```

앱을 실행해 AI 모델 준비 상태를 확인하고, 검색창 아래 자연어 검색을 켠 다음 요청을 입력한다. 존재하지 않는 교수·시설의 위치를 추측해서 제공하지 않는다. 시설 기록이 있어도 경로가 연결되지 않았다면 길 안내와 구분한다.

## 실행 설정과 검증 범위

- llama.rn 0.12.9, 문맥 4096, CPU 4스레드, GPU 층 0, 출력 한도 1024, `enable_thinking: false`.
- Gemma 4 Windows llama.cpp 실제 로드·추론과 A100 36층 GPU 오프로딩 확인. 앱의 Android 실기기 로드·메모리·속도·외부 파일 접근은 별도 기기 검증 대상이다. PC/A100 시간을 휴대폰 속도로 해석하지 않는다.
- 1차 V4: 이미 본 한국어150에서 선정한 고정25 회귀 시험. JSON 25/25, 의미 22/25, 후보 22/25, 상태 24/25, 안전 검사 23/25, 전체 21/25. 평가 출력 보정이나 정답 수정 없음. 25건은 독립 일반화 성능이 아니다.
- 이전 V3의 새 독립8은 의미 4/8이었다. 이를 V4의 독립8 결과로 보고하지 않는다. 아직 누락·조건 오류가 있으므로 모든 요청의 성공을 보장하지 않는다.
- 코드 확인: `npm run typecheck`, `npm run lint -- --quiet`, `npm test -- src/nlp/searchPipeline.test.ts src/nlp/resolveIntent.test.ts`.

자세한 앱 빌드는 [개발 가이드](개발-가이드.md)를 따른다. 배포된 검증 버전이 바뀌면 모델 경로·SHA·프로토콜·검증 수치를 함께 확인한다.
