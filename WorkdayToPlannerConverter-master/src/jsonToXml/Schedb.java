package jsonToXml;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;

public class Schedb {
	private ArrayList<dept> departments;
	private String generated;
	private int minutesPerBlock;
	
	
	Schedb(){
		departments = new ArrayList<dept>();
		generated = new SimpleDateFormat("h:mm a MMM d, YYYY").format(new Date());
		minutesPerBlock = 30;
		generateAllDepartments();
	}
	
	public void generateAllDepartments() {
		departments.add(new dept("AB", "Arabic"));
		departments.add(new dept("ACC", "Accounting"));
		departments.add(new dept("AE", "Aerospace Engineering"));
		departments.add(new dept("AR", "Art"));
		departments.add(new dept("ARCH", "Architecture"));
		departments.add(new dept("AREN", "Architectural Engineering"));
		departments.add(new dept("AS", "Air Science"));
		departments.add(new dept("BB", "Biology"));
		departments.add(new dept("BCB", "Bioinformatics & Computational Biology"));
		departments.add(new dept("BME", "Biomedical Engineering"));
		departments.add(new dept("BUS", "Business"));
		departments.add(new dept("CE", "Civil Engineering"));
		departments.add(new dept("CH", "Chemistry"));
		departments.add(new dept("CHE", "Chemical Engineering"));
		departments.add(new dept("CN", "Chinese"));
		departments.add(new dept("CS", "Computer Science"));
		departments.add(new dept("CP", "Co-op"));
		departments.add(new dept("DEV", "Development"));
		departments.add(new dept("DS", "Data Science"));
		departments.add(new dept("ECE", "Electrical & Computer Engineering"));
		departments.add(new dept("ECON", "Economics"));
		departments.add(new dept("EDU", "Teacher Education"));
		departments.add(new dept("EN", "English"));
		departments.add(new dept("ENV", "Environmental Studies"));
		departments.add(new dept("ES", "Engineering Science"));
		departments.add(new dept("ESL", "English as a Second Language"));
		departments.add(new dept("ETR", "Entrepreneurship"));
		departments.add(new dept("FIN", "Finance"));
		departments.add(new dept("FP", "Fire Protection"));
		departments.add(new dept("FY", "First Year"));
		departments.add(new dept("GE", "Geology"));
		departments.add(new dept("GN", "German"));
		departments.add(new dept("GOV", "Government, Political Science, and Law"));
		departments.add(new dept("HI", "History"));
		departments.add(new dept("HU", "Humanities"));
		departments.add(new dept("ID", "Interdisciplinary"));
		departments.add(new dept("IDG", "Interdisciplinary-Graduate"));
		departments.add(new dept("IGS", "Integrative & Global Studies"));
		departments.add(new dept("IMGD", "Interactive Media & Game Development"));
		departments.add(new dept("INTL", "International & Global Studies"));
		departments.add(new dept("ISE", "Integrated Skills in English"));
		departments.add(new dept("JP", "Japanese"));
		departments.add(new dept("MA", "Mathematical Sciences"));
		departments.add(new dept("ME", "Mechanical Engineering"));
		departments.add(new dept("MFE", "Manufacturing Engineering"));
		departments.add(new dept("MIS", "Management Information Systems"));
		departments.add(new dept("MKT", "Marketing"));
		departments.add(new dept("ML", "Military Leadership"));
		departments.add(new dept("MME", "Mathematics for Educators"));
		departments.add(new dept("MPE", "Physics for Educators"));
		departments.add(new dept("MTE", "Materials Science & Engineering"));
		departments.add(new dept("MU", "Music"));
		departments.add(new dept("NEU", "Neuroscience"));
		departments.add(new dept("NSE", "Nuclear Science & Engineering"));
		departments.add(new dept("OBC", "Organizational Behavior & Change"));
		departments.add(new dept("OIE", "Operations & Industrial Engineering"));
		departments.add(new dept("OT", "Other"));
		departments.add(new dept("PC", "Project Center"));
		departments.add(new dept("PH", "Physics"));
		departments.add(new dept("PSY", "Psychology"));
		departments.add(new dept("PY", "Philosophy"));
		departments.add(new dept("RBE", "Robotics Engineering"));
		departments.add(new dept("RE", "Religion"));
		departments.add(new dept("SD", "System Dynamics"));
		departments.add(new dept("SEME", "Science, Engineering, Math Education"));
		departments.add(new dept("SOC", "Sociology"));
		departments.add(new dept("SP", "Spanish"));
		departments.add(new dept("SS", "Social Science"));
		departments.add(new dept("STS", "Society-Technology Studies"));
		departments.add(new dept("SYS", "Systems Engineering"));
		departments.add(new dept("TH", "Theatre"));
		departments.add(new dept("WR", "Writing"));
		departments.add(new dept("WPE", "Wellness & Physical Education"));
		
	}


	public ArrayList<dept> getDepartments() {
		return departments;
	}


	public void setDepartments(ArrayList<dept> departments) {
		this.departments = departments;
	}


	public String getGenerated() {
		return generated;
	}


	public void setGenerated(String generated) {
		this.generated = generated;
	}


	public int getMinutesPerBlock() {
		return minutesPerBlock;
	}


	public void setMinutesPerBlock(int minutesPerBlock) {
		this.minutesPerBlock = minutesPerBlock;
	}
}
