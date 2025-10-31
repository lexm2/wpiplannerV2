/**
 * Type definitions for Workday JSON input format
 * Based on WPI's Workday course data feed structure
 */

export interface WorkdayFeed {
    Report_Entry: WorkdaySection[];
}

export interface WorkdaySection {
    Academic_Level: string;
    Academic_Units: string;
    Academic_Year: string;
    Course_Description: string;
    Course_Section: string;
    Course_Section_Description: string;
    Course_Section_End_Date: string;
    Course_Section_Owner: string;
    Course_Section_Start_Date: string;
    Course_Tags: string;
    Course_Title: string;
    Credits: string;
    Delivery_Mode: string;
    Enrolled_Capacity: string;
    Instructional_Format: string;
    Instructors: string;
    Locations: string;
    Meeting_Day_Patterns: string;
    Meeting_Patterns: string;
    Offering_Period: string;
    Section_Details: string;
    Section_Status: string;
    Starting_Academic_Period_Type: string;
    Subject: string;
    Waitlist_Waitlist_Capacity: string;
    cour_sec_def_referenceID: string;
    CF_LRV_Cluster_Ref_ID?: string;
}
