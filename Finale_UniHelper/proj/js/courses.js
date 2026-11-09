/* UniHelper course catalog — source: aupp.edu.kh/course-descriptions (2026-2027).
   NOTE: the public page could only be read up to INF 656. Courses found in an uploaded
   degree audit or semester schedule are added automatically (see app.js).
   Format: CODE|Title|Credits|Prerequisites (;-separated)|u
   Prereq tokens: course codes; *B/*C/*E/*L = completed Business/COMM/ESOC/LAW foundation; ~J junior, ~S senior standing
   u = University of Arizona dual-degree course */
window.COURSE_DATA = `
COMM 103|Oral Communication|3|ENGL 101
ENGL 101|English Composition I|3|
ENGL 102|English Composition II|3|ENGL 101
ENVS 131A|Environmental Science (Lab)|1|
ENVS 131C|Environmental Science|3|
HIST 131|World History from 1500 CE to the Present|3|
HUMN 101|Introduction to the Humanities|3|
HUMN 110|Arts and Culture|3|
HUMN 250|Ethics and Society|3|
MATH 177|Elementary Statistics|3|
MATH 200|Business Calculus|3|
PHIL 110|Critical Thinking|3|
POLS 110|Introduction to Political Science|3|
PSYC 101|Introductory Psychology|3|
SMNR 101|First Year Experience|1|
ITEC 101|Introduction to Information Technology|3|
GLBA 101|Introduction to International Relations|3|
ACCT 201|Financial Accounting|3|MATH 200
ACCT 202|Managerial Accounting|3|ACCT 201
ACCT 400E|Intermediate Accounting for Business Administration Majors|3|*B|u
BCOM 314|Business Communication|3|
BCOM 314R|Business Communication|3|*B|u
BUSN 200|Introduction to Business Communication|3|ENGL 102
BUSN 300|Legal Environment for Business|3|
BUSN 360|Business Ethics and Social Responsibility|3|
BUSN 370|Information Management Systems|3|ITEC 101
BUSN 370L|Information Management Systems (Lab)|1|
BUSN 380|Digital and Social Media Analytics|3|
BUSN 440|Introduction to Human Resource Management|3|
BUSN 478|Project Management|3|
BUSN 479|Practical Entrepreneur|3|
BUSN 480|Supply Chain Management|3|
BUSN 492|Data Visualization|3|
BUSN 495|Special Topic (Business)|3|~S
COMM 102|Introduction to Communication|3|ENGL 101
COMM 300|Introduction to Communication Theory|3|*C|u
COMM 309|Introduction to Mass Media Effects|3|*C|u
COMM 311|Communication Technology Theory|3|*C|u
COMM 411|Communication and Conflict Management|3|*C|u
ECON 200|Economics|3|MATH 177
ECON 301|Economics II|3|ECON 200
ECON 306|Applied Statistics|3|MATH 200
ECON 330|Macroeconomic and Global Institutions and Policy|3|*B|u
ECON 400|Economic Strategy for Business|3|ECON 200
ECON 425|Managerial Economics|3|ECON 200
ECON 430|International Economics|3|ECON 200
ECON 441|Microeconomics II|3|ECON 200
ECON 442|Macroeconomics II|3|ECON 200
ECON 467|Economics of the Environment|3|ECON 200
ECON 470|Economics of Development|3|ECON 200
ECON 480|Comparative Economic Systems|3|ECON 200
ECON 481|Economics of the Asia Pacific Region|3|ECON 200
ENTR 110|Introduction to Entrepreneurship|3|
ENTR 420R|Innovation Principles and Environments|3|*B|u
ENTR 480|Global Social Entrepreneurship|3|
ENTR 482|Tech Ventures|3|
ENTR 486|Finance for New Ventures|3|
ENTR 488|Marketing Research for Entrepreneurs|3|
ENTR 490|Sales for New Ventures|3|
ENTR 495|Independent Study for Entrepreneurship|3|
ESOC 211|Collaborating in Online Communities|3|*E|u
ESOC 212|Social Media Strategies Across Professions|3|*E|u
ESOC 300|Digital Storytelling and Culture|3|*E|u
ESOC 301|Qualitative Internet Research|3|*E|u
ESOC 314|Theories of New Media|3|*E|u
ESOC 330|Digital Dilemmas – Privacy, Property, and Access|3|*E|u
ESOC 340|Information, Multimedia Design and the Moving Image|3|*E|u
ESOC 418|Information Trust, Manipulation, and Deception|3|*E|u
ESOC 480|Digital Engagement|3|*E|u
FIN 311|Introduction to Finance|3|*B|u
FIN 460|Real Estate Finance and Investment|3|*B|u
FINC 301|Introduction to Finance|3|
INTS 400|Internship|3|~J
ISEC 100|The Information Era Development|3|
ISEC 214|Introduction to Data Science|3|ISEC 100
MGMT 301|Principles of Management|3|
MGMT 320|Operations Management|3|
MGMT 402|Integrating Business Fundamentals with Ethics & Law in Management|3|*B|u
MGMT 450|Leadership|3|
MGMT 460|Strategic Management|3|
MIS 304|Using and Managing Information Systems|3|*B|u
MIS 478|Project Management|3|*B|u
MKTG 301|Introduction to Marketing|3|
MKTG 302|Digital Marketing|3|MKTG 301
MKTG 303|Marketing Analytics|3|MKTG 301
MKTG 376|Marketing Analytics|3|*B|u
PR 201|Introduction to Public Relations|3|*C|u
PR 204|Strategic Public Relations|3|*C|u
PR 205|Public Relations Ethics|3|*C|u
PR 317|Strategic Writing for Public Relations|3|*C|u
PR 320|Principles of Persuasion|3|*C
PR 421|Public Relations Campaigns|3|*C|u
PR 423|Crisis Communication and Public Relations|3|*C|u
LAW 401|Procedure|3|*L|u
LAW 402A|The American Common Law System I|3|*L|u
LAW 402B|The American Common Law System II|3|*L|u
LAW 404|The American Public Law System|3|*L|u
LAW 407|Legal Analysis, Writing and Research|3|*L|u
LAW 416|Intro to Business Organizations|3|*L|u
LAW 440A|Introduction to Human Rights|3|*L|u
LAW 444B|International Commercial Transactions|3|*L|u
LAW 453A|Introduction to International Trade Law|3|*L|u
LAW 454|Environmental Law and Policy|3|*L|u
LAW 459|Public International Environmental Law|3|*L|u
LEGL 101|Introduction to Law and the Legal System|3|ENGL 101
LEGL 199|English for Legal Purposes|3|LEGL 101
LEGL 201|Legal Research and Writing|3|LEGL 101;LEGL 199
LEGL 230|Environmental Law|3|LEGL 101;LEGL 199
LEGL 261|Cambodian Civil Code I|3|LEGL 101;LEGL 199
LEGL 310|Legal Ethics|3|LEGL 101;LEGL 199
LEGL 332|Cambodian Criminal Law and Procedure|3|LEGL 101;LEGL 199
LEGL 333|Moot Court|3|*L
LEGL 334|Cambodian Business Law|3|*L
LEGL 340|Labor Law|3|*L
LEGL 350|Family Law|3|*L
LEGL 360|Southeast Asian Law and Legal Systems|3|LEGL 101;LEGL 199
LEGL 361|Cambodian Civil Code II|3|LEGL 101;LEGL 199
LEGL 380|Genocide|3|*L
LEGL 385|Gender and Law|3|*L
LEGL 390|Negotiation and Dispute Settlement|3|*L
LEGL 450|Intellectual Property|3|*L
LEGL 470|Chinese Law and Legal Culture|3|*L
LEGL 495|Special Topic (Law)|3|*L
AIN 320|Computer Vision|3|ITM 201
ICT 209|Fundamentals of Artificial Intelligence|3|ITEC 101
CLD 371|Cloud Operations|3|ITM 201
CLD 372|Cloud Solutions Architect|3|ITM 201
CLD 373|Cloud Automation with DevOps|3|
CLD 374|Cloud Developing with CI/CD|3|ITM 380
CLD 375|Cloud Machine Learning Foundation and Data Engineering|3|ITM 380
CLD 376|Cloud Native Development|3|ITM 380
CLD 377|Cloud Security|3|ITM 201
COSC 111|Computer Science Survey|3|
COSC 121|Computer Science A (Python)|3|
COSC 221|Computer Science B (Advanced Python)|3|COSC 111;COSC 121
COSC 241|Computing Science Fundamentals|3|COSC 111
COSC 251|Data Structure|3|COSC 111;ITM 201
COSC 331|Operating Systems|3|COSC 111
COSC 340|Networking Essentials|3|COSC 111
COSC 421|Programming Languages|3|
COSC 431|Computer Graphics|3|
COSC 441|Software Engineering|3|
CSCI 111|Survey of Computer Science|3|
CSCI 121|Computer Science I|3|CSCI 111
CSCI 221|Computer Science II|3|CSCI 121
CSCI 241|Foundations of Computing|3|
CSCI 251|Data Structures|3|
CSCI 321A|Assembly Language|3|
CSCI 331|Operating Systems|3|
CSCI 421|Programming Languages|3|
CSCI 431|Computer Graphics|3|
CSCI 441|Software Engineering|3|
CYBR 351|Introduction to Cybersecurity|3|COSC 111
CYBR 352|Linux Fundamentals|3|COSC 111
CYBR 353|Python Fundamentals|3|COSC 111
CYBR 354|Network Research|3|COSC 111
CYBR 355|Penetration Testing|3|CYBR 351;CYBR 352
CYBR 356|SOC Analyst|3|CYBR 354
CYBR 357|Digital Forensics|3|CYBR 354
CYBR 358|Governance, Risk Management and Compliance|3|COSC 111
CYS 351|Intro to Cyber|3|
CYS 352|Linux Fundamentals|3|
CYS 353|Python Fundamentals|3|
CYS 354|Network Research|3|
CYS 355|Digital Forensics|3|
CYS 356|Penetration Testing|3|
CYS 357|SOC Analyst|3|
CYS 358|Governance, Risk and Compliance|3|
FYP 401|Final Year Project I|3|~S
FYP 402|Final Year Project II|3|~S
ICT 301|Software Analysis and Design|3|COSC 111
ICT 302|Mobile App Cross-platform Development I|3|COSC 221;ITM 201
ICT 303|UI/UX Design|3|COSC 111
ICT 304|Mobile App Cross-platform Development II|3|COSC 111
ICT 305|Software Architecture and Design Patterns|3|ITM 201
ICT 320|Cybersecurity Technician|3|ITEC 101;MATH 177
ICT 360|Introduction to Internet of Things|3|COSC 221
ICT 361|Introduction to Robotics|3|COSC 221
ICT 375|Digital Linguistics and Discourse|3|ENGL 102
ICT 401|Innovation and Design Thinking|3|
ICT 405|Ethical Hacking|3|ICT 320
ICT 406|Advance Ethical Hacking|3|ICT 405
ICT 452|Software Testing|3|ITM 301
INF 250|Introduction to Web Development|3|
INF 300|Foundations of Informatics|3|
INF 304|Management Information Systems|3|
INF 315|Enterprise Resource Planning|3|
INF 330|Business Intelligence|3|ITEC 101
INF 360|Programming with Python|3|
INF 405|Research Methods in Informatics|3|INF 300
INF 430|Technology Innovation and Entrepreneurial Leadership|3|INF 300
INF 490|Capstone Seminar in Informatics|3|~S
INF 604|Data Analysis I|3|ITEC 101
INF 610|Public Policy, Ethics and Law in Information Networking|3|
INF 650|Introduction to Human-Computer Interaction|3|
INF 651|Front-End Web Development|3|INF 250;INF 360
INF 652|Database Design and Programming|3|INF 250;INF 360
INF 653|Back-End Web Development I|3|INF 651
INF 654|Mobile Web Development I|3|INF 653
INF 655|Front-End Web Development II|3|
INF 656|Back-End Web Development II|3|INF 653
`;
